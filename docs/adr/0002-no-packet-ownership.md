# 0002 — No packet ownership

Every plugin may observe every packet via `bot.onPacket(header, fn)`; no plugin owns or exclusively claims a packet header. Request/response correlation (e.g. combat) is built as a helper on top of open observation, not as a claim.

We considered exclusive header claims (one plugin per header) but rejected them: claims add ordering and composition complexity, and correlation is achievable without exclusivity. A future reader should not "fix" this by reintroducing ownership.
