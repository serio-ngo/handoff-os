export default async ({ directory }) => {
  const bridge = await import("../../plugins/handoff-os/scripts/bridge.mjs");
  const cwd = directory || process.cwd();
  return {
    "tool.execute.before": async (input, output) => {
      const reason = bridge.verdictFor(input.tool, output.args ?? {}, input.sessionID, cwd);
      if (reason) throw new Error(reason);
    },
  };
};
