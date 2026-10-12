import { Plugin } from "@opencode/plugin/tui"

export default Plugin.define({
  id: "vvaldez.version.tui",
  setup(context) {
    // Show the harness version in the in-session footer status row
    // (the home footer already renders a version; the prompt footer does not).
    return context.ui.slot({
      append: "prompt.footer.status",
      render: () => <text fg={context.theme.text.base}>v{context.app.version}</text>,
    })
  },
})
