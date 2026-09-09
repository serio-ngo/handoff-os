export default async ({ directory }) => {
  const bridge = await import("../../plugins/handoff-os/scripts/bridge.mjs");
  const cwd = directory || process.cwd();
  return {
    "tool.execute.before": async (input, output) => {
      const reason = bridge.verdictFor(input.tool, output.args ?? {}, input.sessionID, cwd);
      if (reason) throw new Error(reason);
    },
    "tool.execute.after": async (input, output) => {
      bridge.receiptFor(input.tool, input.args ?? {}, input.sessionID, cwd);
    },
    event: async ({ event }) => {
      const id = event?.type === "session.idle" ? event.properties?.sessionID : null;
      if (id) bridge.flush(id, cwd);
    },
  };
};
