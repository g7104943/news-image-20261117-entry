# The World Today — 17 November 2026

[![make.fun](https://make.fun/badge/news-image-20261117.svg)](https://make.fun/c/news-image-20261117)
[![rank](https://make.fun/badge/news-image-20261117/g7104943/news-image-20261117-entry/rank.svg)](https://make.fun/c/news-image-20261117)
[![reward](https://make.fun/badge/news-image-20261117/g7104943/news-image-20261117-entry/reward.svg)](https://make.fun/c/news-image-20261117)

A newspaper front page that sums up the world's news of Tuesday
**17 November 2026** in one image.

`main.ts` (Node 22, standard library only) draws the whole page from
scratch — masthead, four illustrated stories and an "also today" strip —
with a hand-written PNG encoder and a built-in 5×7 bitmap font. No
network, no external files: it runs twice and writes byte-identical
`entry.png` (1024×1024, under 1 MiB).

## The day's stories

1. **Ukraine hits the Crimea Bridge again** — Ukraine struck the Kerch
   Bridge for a second time in a day; Russia hit two bridges in Kyiv in
   reply.
2. **Tankers hit, 3rd US carrier arrives** — mines hit tankers near the
   Strait of Hormuz; Iranian drones targeted a US radar in Bahrain; the
   USS Theodore Roosevelt arrived in the Gulf.
3. **Xi, Trump and Putin to meet in Shenzhen** — China confirmed the
   first three-way summit of the three leaders, on Thursday at the APEC
   meeting.
4. **Outages hit banks, flights and tech** — JPMorgan, Microsoft, the
   FAA and Apple all suffered outages in one day.

Also today: Cyclone Akvan nears India; the Pentagon fails its audit for
a 9th year; Japan scrambles jets over a Russian incursion; the UN opens
talks to ban killer robots; the UK sanctions firms building West Bank
settlements.

Sources are listed in [research.md](research.md).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see [LICENSE](LICENSE).
