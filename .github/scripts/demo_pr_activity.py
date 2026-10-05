#!/usr/bin/env python3
"""
Synthetic PR-activity generator for RobertMWF-Test-Org/repo-test.

Runs hourly via a GitHub Actions schedule between 2026-10-01 and 2026-10-21
(Europe/Andorra time). Each invocation is stateless; the day's plan is derived
deterministically from the date, and per-PR merge timing is persisted in the
PR body itself (a hidden HTML comment), so no separate state file is needed.

Content of the generated PRs is irrelevant and clearly labelled as synthetic -
they exist only to produce realistic-looking open/approve/merge timestamps for
a PR-activity reporting macro demo.
"""
import datetime
import hashlib
import json
import os
import random
import subprocess
import sys
from zoneinfo import ZoneInfo

REPO = "RobertMWF-Test-Org/repo-test"
TZ = ZoneInfo("Europe/Andorra")
WINDOW_START = datetime.date(2026, 10, 1)
WINDOW_END = datetime.date(2026, 10, 21)
MAX_CREATES_PER_RUN = 3
TITLE_TAG = "[Demo]"
MERGE_DUE_MARKER = "<!-- merge-due: "

OPENER_TOKEN = os.environ["OPENER_TOKEN"]
APPROVER_TOKEN = os.environ["APPROVER_TOKEN"]


def run(cmd, env_overrides=None, check=True):
    env = os.environ.copy()
    if env_overrides:
        env.update(env_overrides)
    result = subprocess.run(cmd, shell=True, env=env, capture_output=True, text=True)
    if check and result.returncode != 0:
        print(f"FAILED: {cmd}\nSTDOUT: {result.stdout}\nSTDERR: {result.stderr}", file=sys.stderr)
        raise SystemExit(result.returncode)
    return result.stdout.strip()


def main():
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    now_local = now_utc.astimezone(TZ)
    today = now_local.date()

    if today < WINDOW_START or today > WINDOW_END:
        print(f"{today} is outside the demo window ({WINDOW_START} to {WINDOW_END}); nothing to do.")
        return

    # Deterministic per-day plan - every hourly run on the same day agrees on
    # the same target count and the same slot times, with no persisted state.
    seed = int(hashlib.sha256(today.isoformat().encode()).hexdigest(), 16) % (2**32)
    day_rng = random.Random(seed)

    is_weekend = today.weekday() >= 5
    if is_weekend:
        active = day_rng.random() < 0.25
        target = day_rng.randint(1, 3) if active else 0
    else:
        target = day_rng.randint(8, 12)

    kind = "weekend" if is_weekend else "weekday"
    print(f"Plan for {today} ({kind}): target={target} PR(s)")

    slot_times = []
    if target > 0:
        window_minutes = (18 - 9) * 60
        offsets = sorted(day_rng.sample(range(0, window_minutes), target))
        base = now_local.replace(hour=9, minute=0, second=0, microsecond=0)
        slot_times = [base + datetime.timedelta(minutes=m) for m in offsets]

    slots_due = sum(1 for t in slot_times if t <= now_local)

    opener_env = {"GH_TOKEN": OPENER_TOKEN}
    approver_env = {"GH_TOKEN": APPROVER_TOKEN}

    # How many demo PRs already exist for today (any state)?
    search = f'in:title "{TITLE_TAG}" created:{today.isoformat()}'
    existing_today_json = run(
        f'gh pr list --repo {REPO} --state all --search \'{search}\' --json number',
        env_overrides=opener_env,
    )
    existing_today = json.loads(existing_today_json) if existing_today_json else []
    already_created = len(existing_today)

    to_create = max(0, min(slots_due - already_created, MAX_CREATES_PER_RUN))
    print(f"{slots_due} slot(s) due so far today, {already_created} already created, creating {to_create} now")

    for _ in range(to_create):
        ts = datetime.datetime.now(datetime.timezone.utc)
        suffix = day_rng.randint(1000, 9999)
        branch = f"demo/activity-{ts.strftime('%Y%m%d%H%M%S')}-{suffix}"

        run("git fetch origin main")
        run("git checkout main")
        run("git reset --hard origin/main")
        run(f"git checkout -b {branch}")

        # Each PR gets its own file (not a shared log) so that out-of-order or
        # concurrent merges can never conflict with each other structurally -
        # previously every PR appended to the same demo-activity-log.md, which
        # produced real merge conflicts once more than one PR was open at once.
        os.makedirs("demo-logs", exist_ok=True)
        log_path = f"demo-logs/activity-{ts.strftime('%Y%m%d%H%M%S')}-{suffix}.md"
        with open(log_path, "w") as f:
            f.write(f"Synthetic demo activity entry - {ts.isoformat()}\n")

        run(f'git -c user.name="GHClaudio-test" -c user.email="GHClaudio-test@users.noreply.github.com" add {log_path}')
        run('git -c user.name="GHClaudio-test" -c user.email="GHClaudio-test@users.noreply.github.com" commit -m "demo: synthetic activity entry"')
        run(f"git push https://{OPENER_TOKEN}@github.com/{REPO}.git {branch}:{branch}")

        merge_due = ts + datetime.timedelta(hours=random.uniform(5, 10))
        body = (
            "This is a synthetic demo pull request, generated automatically to "
            "produce realistic-looking activity data for a PR-activity reporting "
            "macro demo. The content of this PR is not meaningful and it will not "
            "be reviewed as real work.\n\n"
            f"{MERGE_DUE_MARKER}{merge_due.isoformat()} -->"
        )
        title = f"{TITLE_TAG} Synthetic activity PR {ts.strftime('%Y-%m-%d %H:%M UTC')}"

        pr_body_file = "/tmp/demo_pr_body.txt"
        with open(pr_body_file, "w") as f:
            f.write(body)

        run(
            f'gh pr create --repo {REPO} --title "{title}" --body-file {pr_body_file} --base main --head {branch}',
            env_overrides=opener_env,
        )
        print(f"Opened PR on branch {branch}, merge due {merge_due.isoformat()}")

    # --- Approve + merge any demo PR whose merge-due time has passed ---
    open_json = run(
        f'gh pr list --repo {REPO} --state open --search \'in:title "{TITLE_TAG}"\' --json number,body',
        env_overrides=opener_env,
    )
    open_prs = json.loads(open_json) if open_json else []

    merged_count = 0
    for pr in open_prs:
        body = pr.get("body") or ""
        if MERGE_DUE_MARKER not in body:
            continue
        ts_str = body.split(MERGE_DUE_MARKER, 1)[1].split(" -->", 1)[0].strip()
        try:
            due = datetime.datetime.fromisoformat(ts_str)
        except ValueError:
            continue

        if due <= now_utc:
            num = pr["number"]
            try:
                run(
                    f'gh pr review {num} --repo {REPO} --approve --body "Approved - synthetic demo PR."',
                    env_overrides=approver_env,
                )
                run(
                    f'gh pr merge {num} --repo {REPO} --merge --delete-branch',
                    env_overrides=approver_env,
                )
                merged_count += 1
                print(f"Approved and merged PR #{num}")
            except SystemExit:
                # One PR failing to merge (e.g. a stale/conflicting branch)
                # must not block every other eligible PR in this run - log it
                # and keep going instead of aborting the whole script.
                print(f"Could not merge PR #{num}, skipping it this run", file=sys.stderr)

    print(f"Run summary: created {to_create}, merged {merged_count}")


if __name__ == "__main__":
    main()
