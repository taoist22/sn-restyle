# sn-restyle — Session Startup Instructions

## Read these at the start of every session, in this order

1. `/Users/ctreatherford/.claude/projects/-Users-ctreatherford-supernote-plugins/memory/MEMORY.md` — index of all shared plugin memory
2. `/Users/ctreatherford/.claude/projects/-Users-ctreatherford-supernote-plugins/memory/project_sn_restyle.md` — this plugin's current state, open bugs, design decisions
3. `/Users/ctreatherford/.claude/projects/-Users-ctreatherford-supernote-plugins/memory/reference_modifyelements_lasso.md` — critical modifyElements rules (sn-restyle relies on this heavily)
4. `/Users/ctreatherford/.claude/projects/-Users-ctreatherford-supernote-plugins/memory/feedback_ask_before_editing.md`
5. `/Users/ctreatherford/.claude/projects/-Users-ctreatherford-supernote-plugins/memory/feedback_no_push_before_testing.md`
6. `/Users/ctreatherford/.claude/projects/-Users-ctreatherford-supernote-plugins/memory/feedback_build_snplg_delete_first.md`

Then read whichever reference files in `/Users/ctreatherford/supernote-plugins/references/` are relevant to the task at hand (see the skill file for guidance on which to read when).

## Rules

- **Always ask before editing any code file.** Present the plan and wait for approval.
- **Never push, tag, or release before on-device testing.** Wait for explicit user confirmation.
- **Never call `setLassoBoxState` before `modifyElements`.** See `reference_modifyelements_lasso.md`.

## Build command

```
rm -f build/outputs/Restyle.snplg build/outputs/Restyle.zip && JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-21.jdk/Contents/Home ./buildPlugin.sh
```

**Note:** First build after adding android/ requires two runs — `PackageList.java` is generated on the first Gradle build and populated on the second.

**If a .ts change doesn't appear in the bundle:** Metro caches transpiled modules and sometimes ignores edits. Fix with `--reset-cache`:

```
rm -f build/outputs/Restyle.snplg build/outputs/Restyle.zip build/generated/Restyle.bundle
npx react-native bundle --entry-file index.js --bundle-output build/generated/Restyle.bundle --platform android --assets-dest build/generated --dev false --reset-cache
JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-21.jdk/Contents/Home ./buildPlugin.sh
```

**JSX Text children:** Never use `{'\n\n'}` or other expression children in `<Text>` components — multi-child arrays in plugin overlays break button registration at load time. Use separate `<Text>` elements instead.
