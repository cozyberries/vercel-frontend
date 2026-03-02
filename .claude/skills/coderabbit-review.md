# CodeRabbit Review Skill

## Description
Run a CodeRabbit AI code review on uncommitted changes, fix reported bugs, and repeat until clean or the API rate limit is hit. This skill should be run after every code change.

## Trigger
- When the user asks to run a CodeRabbit review, code review, or `/coderabbit`
- **Automatically after every code change session** (before committing)

## Steps

1. **Run CodeRabbit review on uncommitted changes**
   ```bash
   coderabbit review -t uncommitted --plain 2>&1 | tee /tmp/coderabbit-review.txt
   ```
   - Use Bash tool with `timeout: 300000` (5 minutes) since reviews can take a while
   - The results are saved to `/tmp/coderabbit-review.txt`

2. **Analyze findings**
   - For each finding, verify it against the actual code before fixing
   - Categorize each as: valid bug, valid improvement, or false positive
   - Skip false positives with a brief explanation

3. **Fix valid issues**
   - Fix each valid finding in order
   - For each fix:
     - Read the relevant file section
     - Apply the fix using Edit tool
     - Briefly explain what was changed and why

4. **Verify fixes compile**
   - Check dev server logs for compilation errors
   - If a preview server is running, verify affected pages still load

5. **Repeat until clean or rate-limited**
   - Re-run `coderabbit review -t uncommitted --plain 2>&1 | tee -a /tmp/coderabbit-review.txt` after fixing
   - Continue fixing new findings from each round
   - Stop when:
     - No new valid issues are found (clean review), OR
     - CodeRabbit API returns a rate limit error, OR
     - 5 rounds have been completed (safety cap)

6. **Report summary**
   - List all findings across all rounds with status: fixed, skipped (false positive), or needs manual review
   - Mention total rounds run and results file: `/tmp/coderabbit-review.txt`

## Options
- `--type committed` — Review only committed changes (default: uncommitted)
- `--base <branch>` — Compare against a specific branch
- `--config <file>` — Use additional CodeRabbit config

## Example usage
```
/coderabbit                    # Review uncommitted changes (iterative)
/coderabbit --type committed   # Review committed changes
/coderabbit --base main        # Review changes vs main branch
```
