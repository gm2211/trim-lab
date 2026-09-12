# Guided trim and explanations

The trainer recommends a useful next adjustment for the current heading, wind,
and selected reef. It does not claim a unique or calibrated Colgate 26 optimum.

## What is optimized

Close-hauled (27–55° true-wind angle), the objective starts with upwind progress:
`speed × cos(true-wind angle + leeway)`. Elsewhere it starts with speed on the
selected heading. Both include costs for heel above 22°, weather helm above 5°
or lee helm beyond −2°, and sail depth outside a broad teaching band.

The automatic estimate holds the heading fixed. **Balance current sails** also
compares the current heading with 40°, 43°, 46°, 49°, and 52° when close-hauled.
The resulting heading is applied together with its trim. Neither path changes
the selected reef. Search includes ordinary and wing-on-wing starting settings;
windward-sheet tension is accepted only with a filled wing-on-wing jib.
Halyards stay at or above the full-hoist threshold; dropping a sail is not used
as a fine-trim shortcut. No fine-trim target is offered in irons or without wind.

### Depth tradeoff

The simplified force model otherwise rewards maximum camber in many upwind and
reaching conditions, and excessively flat sails on runs. A soft teaching cost
supplies this missing tradeoff without pretending to recalibrate the physical
forces or assigning one mandatory outhaul setting.

For apparent-wind angle `A` in degrees and speed `W` in knots:

```
off    = clamp((A − 55) / 85, 0, 1)
strong = clamp((W − 16) / 12, 0, 1)
light  = clamp((8 − W) / 5, 0, 1)
upper  = 0.14 + 0.02 off − 0.04 strong (1 − 0.65 off)
         − 0.015 light (1 − off)
lower  = max(0.065, upper − 0.035)
```

Depth within this band has no cost. Each sail's distance outside it is divided
by 0.02, squared, and multiplied by 0.18 in the objective. Heel cost is
`0.12 × max(0, heel − 22)^1.3`; helm cost is
`0.06 × max(0, helm − 5, −helm − 2)`. These coefficients and depth bands are
explicit training heuristics, not measurements or universal sailmaker settings.
Wind changes are continuous, and the band allows several controls and settings
to produce comparable shapes. Sea state and crew configuration are not inputs.

## How the next move is chosen

Every trim line is tried in both directions from the actual current settings,
in steps of 12 slider points (24 for the traveler). Recommendations require a
recomputed objective gain greater than 0.015. The largest slider gap is not used.
When single-line trials find no useful gain, selected two-line combinations can
cross a local plateau; their combined benefit is explicitly described as such.

When load is excessive, immediate sheet/traveler relief takes precedence over
fine trim, based on a recomputed reduction in heel and helm. Persistent load
prompts reefing. At lesser overload, a discrete first/second reef trial can be
recommended if it improves handling. The user retains the reef selection;
subsequent estimates re-trim that sail plan.

Explanations state the control effect, actual before/after shape where available,
and an appropriate stop cue. Upwind easing adds depth in measured steps; low
heel alone is not evidence that more depth is needed. On reaches, sheets follow
apparent wind and the vang increasingly controls twist. Deep downwind, sail
presentation, blanketing, and boom stability replace attached-flow telltale cues.
Reefing, hoisting, in-irons recovery, and backing the jib have separate guidance.

Every control, gust, reef, or heading change invalidates old targets immediately.
Slider colors reflect nearby measured benefit rather than distance from one
solution. The **Trim balance** percentage reflects the guided objective gap,
including handling and shape costs, rather than raw speed alone. Shape-change
chips are neutral: a changed shape is not automatically an improvement.

The AI coach receives current conditions, sail plan, and any fresh guided
candidate. Pure questions are instructed to return no control changes. Provider
responses remain generative; deterministic next-move guidance works without an
AI provider.

## Evidence and limitations

Regression tests exercise actual optimization across 4, 8, 12, 18, 24 and 30 kt,
all five sailing points and a near-dead run, plus in-irons, both tacks, and reefs.
They check objective improvement, feasible controls, coupled sheet behavior,
condition-aware explanations, and state restoration. The full Node gate passed 123 tests on the rebuilt page. Browser checks passed
121 WebGL assertions; desktop inspection covered upwind trim application,
30 kt gust relief, immediate target invalidation, and paired downwind advice. These checks establish internal behavior,
not agreement with a measured polar or every real sea condition.

Sailing principles were checked against primary sailmaker guidance:

- [Quantum mainsail trim guide](https://www.quantumsails.com/QuantumSails/media/Whitepapers/Quantum_TrimGuide_Mainsail_March10.pdf): depth for power, flatter sails under excess load, partial upwind outhaul easing, sheet/traveler/vang roles.
- [North Sails cruising trim](https://www.northsails.com/en-us/blogs/north-sails-blog/cruising-sail-trim-north-sails-3di-nordac): apparent-wind trim, depth for chop, and adjusting power to conditions.

Outhaul still feeds a scalar main-depth approximation and sail forces are
steady-state. The teaching cost constrains guidance; it does not replace the
underlying model with vertically resolved sail shaping or measured aerodynamics.
