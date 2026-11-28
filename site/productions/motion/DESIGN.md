# Motion: the Studio's animations as code

By c.motion (an AI agent, account C), 28 November 2026, at Dinis Cruz's word: "productise those animations we are super happy with, and make them super easy for other agents and other pages to use. Extract the variables ... then it's just code that executes it." Widened the same afternoon (c.maestro to c.motion, 17:30 UTC): this is now the product made from what the productions made, sections 10 to 16. A design for review; nothing here is on dev until c.productions or Dinis merges it.

## 1. What we studied

- **Agile Cells v0.5** (`../agile-cells/v0.5/scenes.json`): eight scenes, each `kind: component` pointing at a hand-built lab scene (`../lab/<id>/scene.js`). The two Dinis singled out are `cells-grow` ("four lights become one cell; a person and agents gather in it ... grows to fifty roles") and `refresh-cell` ("one warm light, then the team grows beneath it as a tree of lights, each line running from the one who started or briefed it").
- **Agile history v0.5**: fifteen scenes; the same components plus two built-in kinds of the player (`years`, `credits`).
- **The lab contract** (`../lab/harness.js`): a scene is `meta` plus `create({canvas}) -> { render(t, w, h) }`, and render is a pure function of t. That contract is the right one and we keep it.
- **Account D's storyboard** (`../../accounts/d/format/example.storyboard.json`, `studio-storyboard/0`): beats with `narration` and a `visual.kind` (`title`, `flow`, `list`), facts pointing at sources, and an optional `decision`.

What makes the lab scenes powerful is also what stops them being reused: every actor, label, colour and time is a constant at the top of a 30 KB file (`const N = { owner: { P: [360, 190], t: 0.25, label: 'Dinis Cruz' ... } }`). The story is in the code. Motion moves the story into data and keeps the code generic.

## 2. The variables that make it work

Across every scene we liked, the same few things carry the meaning:

| Variable | What it is | Example from the films |
| --- | --- | --- |
| actors | the lights: id, label, role (person, agent, file, team) | Dinis, c.maestro, a lead agent, scene builders |
| links | who started or briefed whom (the order is the story) | owner to c.maestro to the lead |
| order and timing | when each actor arrives, how long each beat holds | arrivals at 0.25 s, 2.5 s ...; a still at the end |
| growth | counts the group passes through | 6, 10, 20, 30, 50 roles |
| colour by role | warm for people, teal for agents, ink for files | AMBER, TEAL, INK in cells-grow |
| labels and lines | the words on screen, and the narration under them | "This is how we scale" |
| close | what is left when the scene ends | the files on a shelf |
| sources | where each claim comes from | agilecells.org, the start prompt |

## 3. Scene types

Each type is a named, generic renderer whose variables are its whole interface. Time is always in seconds from the scene's start; every type has `seconds`, `title`, `narration`, `sources` and a still frame (`still`, default the last 10 per cent).

| Type | The pattern | Variables |
| --- | --- | --- |
| `handoff` | one agent, then the next, then the next: each light arrives, a pulse runs down the link from the one who briefed it, and its label settles | `actors[] {id, label, role, note}`, `links[] {from, to, label}` (default: a chain in actor order), `direction` (down, across), `step` seconds per hand-off, `carry` (a word or file that travels along each link), `end` (the line at the close) |
| `cell` | a cell growing into a team: a membrane round one light, people and agents arrive, files slide out, it grows in steps to a chart, then folds to its files | `lead {label, role}`, `members[] {label, role}`, `files[]` (roles, rules, work), `growth[]` counts, `close` (fold, keep, none), `end` |
| `timeline` | dated points along a line, the camera walking it | `items[] {date, label, note}`, `span` |
| `before-after` | one picture, then its changed form, with a divider | `before {label, items}`, `after {label, items}`, `split` time |
| `count` | a number that counts up to its value, with a unit and a source | `from`, `to`, `unit`, `label`, `format`, `ease` |
| `title` | a line of words and a subtitle | `text`, `sub` |
| `list` | items revealed one at a time | `items[]` |
| `quote` | words and who said them | `quote`, `by` |
| `decision` | a question, its options with good and bad, the recommendation | as `studio-storyboard/0` `decision` |

The first proof builds `handoff` and `cell`, plus `title` and `count` as small helpers for the brief. The rest are the next round; the hand-built lab scenes stay as they are and can still be named as `component` (section 4), so nothing c.productions has made is thrown away.

## 4. One schema: motion.scene/v1

```json
{
  "schema": "motion.scene/v1",
  "id": "agile-cells-chain",
  "title": "How a cell starts",
  "format": { "w": 720, "h": 1280 },
  "theme": "auto",
  "palette": { "person": "#ffc857", "agent": "#5fd0c5", "file": "#f4f1e8" },
  "sources": [{ "id": "s1", "title": "...", "url": "https://..." }],
  "scenes": [
    { "id": "start", "type": "handoff", "seconds": 9, "title": "One, then the next",
      "narration": "Dinis asks c.maestro; c.maestro starts a cell; the cell starts its developer.",
      "sources": ["s1"],
      "vars": { "actors": [{ "id": "d", "label": "Dinis Cruz", "role": "person" }, { "id": "m", "label": "c.maestro", "role": "agent" }] } }
  ],
  "decision": null
}
```

Rules:

- `type` names a scene type in the runtime registry; `vars` holds only that type's variables, so a page or agent changes a scene by changing `vars`, nothing else.
- `type: "component"` with `vars.component: "<lab id>"` plays a hand-built lab scene through the existing contract.
- `theme`: `ink`, `paper` or `auto` (follows the viewer's light or dark setting). `format` is a design size; the runtime fits any screen and lays out again for portrait.
- Every claim on screen names a source id; the page lists the sources under the player.
- Versioned: a breaking change makes `motion.scene/v2`; the runtime refuses a schema it does not know, with a plain message.

Mapping the two formats we have (a converter, `convert.js`, in the next round):

| From | To |
| --- | --- |
| player `scenes.json`: `kind: component, component: X`, extra keys | `type: component`, `vars: {component: X, ...extra keys}` |
| player `kind: years`, `credits` | `type: timeline`, `type: list` |
| `studio-storyboard/0` `beats[]` | `scenes[]`; `visual.kind` gives the type: `title` to `title`, `flow` to `handoff` (nodes to actors, edges to links), `list` to `list`; `facts` to `sources` |
| `studio-storyboard/0` `decision` | top-level `decision`, played last as `type: decision` |

## 5. The runtime

`motion.js`, one ES module, no build step, no dependency, no network call except the scenes file it is given.

```html
<div data-motion="brief.json"></div>
<script type="module" src="/productions/motion/motion.js"></script>
```

or from code: `import { play } from './motion.js'; const film = play(element, data);` returning `{ seek(t), play(), pause(), replay(vars), duration }`.

- **Canvas 2D**, not WebGL: a phone draws it cheaply and a page can hold any number of films (the player has had to ration WebGL contexts).
- **Pure frames**: `render(ctx, t, vars, layout)`; the same t gives the same frame, so scrubbing, captions, still covers and frame capture all agree. Any randomness is seeded from the scene id.
- **Reduced motion**: when the viewer asks for it, each scene shows its still frame, with Next and Back buttons and the narration as text; nothing moves on its own.
- **Light and dark**: colours come from the palette, with two sets of neutrals (ink background for dark, paper for light) picked by `theme`.
- **Accessible**: the canvas has `role="img"` and an `aria-label` from the scene title; the narration is live text under it, so a screen reader hears the story; controls are real buttons.
- **Adding a type**: `define('handoff', { defaults, seconds(vars), render })`. A new type is one function in one file and needs nothing else to change.

## 6. From a production to a template

1. A production agent finds a way of saying something that works (a lab scene Dinis likes).
2. c.motion (or any developer) reads its constants and names the variables: who arrives, in what order, with what words, for how long.
3. The pattern becomes a scene type in `motion.js`; the lab scene's own film keeps its hand-built version.
4. The production's scene is written once more as `motion.scene/v1` data, and that file is the **template**: copy it, change `vars`, and it tells another story the same way.
5. The page at `/productions/motion/` lets a person edit those variables and watch it replay, so a template is checked by eye before it is used.

## 7. The daily and hourly updates, from data

Dinis: "even my daily updates, even my hourly updates should start to come like that", with the prioritisation in code "so you don't have to reinvent the wheel every time".

`brief.js` turns c.maestro's feeds (`decisions.json`, `maestro.decisions/v0`, and `ideas.json`, `maestro.ideas/v0`) into a `motion.scene/v1` film of about 30 seconds. The proof reads a snapshot in `data/`, taken 28 November 2026 at 17:20 UTC from PrompTugal/PrompTugal__News__Website `board/team/maestro.c/channel/`; a live version would read the same files from wherever they are published.

The rules, written once in `priority.js` and applied the same way every time:

| Rule | In code |
| --- | --- |
| What waits on Dinis leads | status weight: `waiting_on_dinis` 100, `asked` 80, `in_progress` 50, `decided` 40, `done` 20 |
| Newer first within a weight | plus up to 10 for recency inside the window |
| The window | daily: the last 24 hours; hourly: the last hour, and an hourly brief with nothing new is not made |
| Lead | at most three items get a hand-off scene of their own (Dinis, then the agent carrying it, then what it waits on) |
| Cut | the rest are counted, not shown; `done` items only appear as a count |
| Length | title 3 s, hand-offs 6 s each, counts 5 s, close 3 s: never over 30 s |
| Words | the decision's own words, shortened at a word boundary to 70 characters; never a word that is not in the feed |

The output is ordinary scenes data, so the same runtime plays it in a page, a board or a phone app.

## 8. What the proof contains

`site/productions/motion/`:

- `motion.js`: the runtime and the types `handoff`, `cell`, `title`, `count`.
- `priority.js` and `brief.js`: the rules and the generator.
- `index.html`: plays a scenes file; a panel of the scene's variables, edited as JSON, replays on change.
- `examples/agile-cells-chain.json`: the hand-off chain and the cell, written as data from the Agile Cells films.
- `brief.html`: the 30-second brief made from `data/decisions.json` in the browser, with its rules shown under it.

## 9. Not yet

The converter from the two older formats; `timeline`, `before-after`, `quote`, `decision` and `list` as types; voice (the player's Voxtral track would attach as it does now); publishing the brief on a schedule. Each waits on Dinis's word on this proof.

## 10. The product, and its name

What we sell is not a video but a small application that makes one: a set of blocks of the films' quality, each with what a buyer may change and what the movie may never do. Dinis: "we could charge for the creation of these mini movies ... what we're delivering is a team." The buyer changes the words, the counts (5, 10 or 100), the images and the order; the team made the blocks, and keeps them good.

Dinis's leaning, 28 November 2026 (relayed by c.maestro): **Cell Reel**, written as two words; the spelling waits on his confirmation, and code identifiers stay as they are. Not yet checked for trade marks. The names that were proposed:

| Name | Why |
| --- | --- |
| **Cellreel** | a reel made by a cell, and a reel of cells; says both the product and the team behind it |
| **Showcell** | short, sits under Agile Cells as "a cell that shows"; works as a verb ("showcell it") |
| **Lightplay** | the films are lights that move; plain, no jargon, works for a town page as well as for agents |

## 11. The block catalogue

A block must be very visual (it moves, it is not changed text) and explain what agents or people are doing. Judged on the lab scenes, 28 November 2026:

| Scene | Block? | Why |
| --- | --- | --- |
| refresh-cell | **yes: `handoff`** | the hand-off chain Dinis named; who started whom is the whole story, and it is all variables (actors, links, order) |
| cells-grow | **yes: `cell`** | a team forming, growing in counts a buyer picks (5, 20, 50), its files kept; the core of every agent explainer |
| cells-verticals | **yes: `bud`** (next round) | one cell buds into several teams, one per job; the variable is the list of jobs |
| cells-close | **yes: `library`** (next round) | cells built, working and folded onto shelves; counts and labels are the variables |
| refresh-shelf | **yes: `shelf`** (next round) | an old agent leaves its files and a new one reads them: the hand-over between sessions, good for any "memory" explainer |
| refresh-saving, refresh-scroll | **yes: `count`, `before-after`** | a number to true scale, before and after; the numbers come from the buyer's own data |
| refresh-line | maybe | one threshold and marks beyond it; strong but narrow |
| refresh-keys | no, for now | keys and sealed envelopes explain our own signing; too specific to sell before the general blocks |
| currents, royce-cascade, snowbird-page, spread, badge-factory, voices | no | history of Agile: the picture is the fact (1970, seventeen people, one page); a buyer changing it would make it untrue |
| agile-trailer, refresh-trailer, cells-intro | no | trailers stitched from other scenes; a block catalogue makes these from blocks, not the other way |

## 12. The movie behaviour policy

"Not everything should be manipulable. It's like a movie behaviour policy: the movie can only behave a certain way." Each block declares its policy in code (`policy` beside `render` in `motion.js`) and as data (`policy.json`, `motion.policy/v1`), and `play()` passes every scene through `enforce(type, vars)` before the first frame: anything outside the policy is clamped or dropped, and the page says what it changed.

| | Open to the buyer | Locked |
| --- | --- | --- |
| `handoff` | actor labels (40 characters), roles from the palette, 2 to 7 actors, link labels, the carried word, the end line, order of actors | arrival timing (1.2 to 3 s per hand-off), the curve and pulse, layout and margins, glow and type sizes |
| `cell` | lead and member labels, 1 to 8 named members, file names (up to 4), growth counts (1 to 100), the end line, whether it folds | membrane shape, growth timing, the chart layout, how files leave and return |
| `count` | from, to, unit, label (40 characters) | easing, duration (2 to 6 s), number format |
| `title` | text (60 characters), sub (90 characters) | type, place, timing |
| every block | narration (240 characters), images (same origin only, shown in the block's own frame), palette from a fixed list | never: a person's face or likeness, a logo not the buyer's own, a claim without a source, flashing faster than three times a second |

## 13. One block, both orientations

A scene file has no orientation. Every block lays out from the shape of the box it is drawn in: under 1 (portrait, a phone, a story) the hand-off chain runs down; over 1 (landscape, a page, YouTube) it runs across; it lays out again when the box changes. The page shows the same `handoff` scene in 9:16 and 16:9 side by side, stacked on a phone.

## 14. Narration

By default the words are on screen and in the page as text. "Voice: browser" turns on the browser's own speech (`speechSynthesis`), which costs nothing and sends nothing from our site; it never starts by itself. A recorded voice (the player's Voxtral track) can be given per scene as `audio` and is used when present, labelled as made by AI.

## 15. Three worked uses

1. **A PrompTugal.news town page.** One film for every town: `title` (the town's name), `handoff` (the reader's question, the newsroom agent, the town's sources, the published piece), `count` (the town's own number of articles from the site's data). The only difference between towns is two or three of the town's own public images in the image slots and the counts. Every town has what looks like a made presentation, made by code.
2. **What an agent behaviour policy is.** `cell` (a team forms for a task), then the policy shown as the cell's wall: `handoff` where one hand-off is refused because the policy says no, and the work goes round it; the end line names the rule. People experience a policy instead of reading its concepts. (A `refusal` link style in `handoff` is the one addition this needs.)
3. **A buyer's mini movie.** The buyer opens their film in the small app (the editor on this page, with only the open variables), sets "show 10, not 50", types their team's names, picks colours from the palette, sees it in both orientations, and saves a scenes file; their site plays it with one script tag.

## 16. Dinis's to decide

- The name: he leans to Cell Reel (section 10); the spelling waits on his confirmation.
- Which blocks are offered first (the proof has `handoff` and `cell`; section 11 proposes `bud`, `library`, `shelf` next).
- Prices, and whether the product sits under Agile Cells (decision 2026-11-28-go-to-market in the feed is still waiting on him).
- Whether a buyer may upload their own images, or only choose from a set; and whether Higgsfield and other engines may fill image slots.
- Whether the town pages of PrompTugal.news are the first real use.
