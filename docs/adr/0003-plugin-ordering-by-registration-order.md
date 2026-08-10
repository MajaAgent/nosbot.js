# 0003 — Plugin ordering by registration order

Plugin dependencies are satisfied by `bot.use()` call order, fastify-style; there is no automated `dependsOn` mechanism. Plugin install only registers hooks and decorates the bot — reads of other plugins' state happen at call/event time, after `login()` has awaited all `onLogin` hooks, so registration order rarely matters in practice.

Factory functions carry no metadata on which to base automation, and an automated mechanism would be dead weight in the first slice. If a real start-time cross-plugin dependency appears, the fastify answer is nested `ctx.use(...)` inside the dependent plugin — not a dependency graph.
