---
name: txtrpg-ui-quality
description: Evaluate and refine TxtRPG browser UI with evidence-driven visual, interaction, accessibility, responsive, and anti-pattern checks. Use for UI redesign, polish, audit, or visual-quality work.
---

# TxtRPG UI Quality

Use this skill for browser-facing design quality work. It adapts useful Impeccable patterns without importing the full Claude Code plugin.

## When to use

Use for:
- new UI screens or major UI restructuring;
- visual polish or redesign;
- interaction hierarchy and information architecture;
- responsive/mobile-width behavior;
- accessibility and keyboard/focus behavior;
- final UI audit before release.

Do not use for engine-only, data-only, persistence-only, or backend-style work.

## Design-first gate

Before editing:

1. Inspect the current DOM, styles, interaction flow, and existing UI patterns.
2. Identify the user's task and the screen's primary job.
3. Preserve the text-first RPG identity and existing information hierarchy unless the Issue explicitly changes it.
4. Prefer existing tokens, components, and utilities.
5. Define what will be visibly or behaviorally different before writing code.

Do not introduce generic SaaS aesthetics merely because they are common defaults.

## Quality review

Evaluate:
- hierarchy: can the player identify the current state, available actions, and important consequences quickly?
- typography: readable sizing, line length, density, emphasis, and consistent hierarchy;
- spacing/layout: alignment, rhythm, grouping, and responsive behavior;
- interaction: hover/focus/active/disabled/error/loading/empty states where relevant;
- accessibility: semantic structure, keyboard access, visible focus, labels, contrast;
- motion: purposeful and restrained; never required for comprehension;
- responsive behavior: narrow viewport, long text, large data, and touch targets;
- RPG coherence: UI supports exploration, information, judgment, action, result rather than obscuring it;
- offline constraints: no unnecessary external assets, network dependencies, or runtime services.

## Anti-patterns

Reject or question:
- decorative cards nested inside cards without information value;
- excessive gradients, glow, glassmorphism, or ornamental motion;
- inconsistent spacing or typography;
- controls that depend on color alone;
- inaccessible custom controls;
- visual redesign that changes game semantics without an Issue requirement;
- new UI dependencies for problems solvable with existing HTML/CSS/JS.

## Evidence loop

For browser-facing changes:
1. Inspect existing implementation.
2. Make the smallest coherent change.
3. Run focused tests.
4. Use Playwright when behavior or layout requires runtime evidence.
5. Check narrow and representative desktop widths when responsive behavior is affected.
6. Compare the result against the Issue acceptance criteria.
7. Only then perform optional polish.

Visual preference is not evidence of functional correctness.

## Relationship to other TxtRPG skills

- txtrpg-ui owns implementation.
- txtrpg-ui-quality owns design-quality evaluation and refinement guidance.
- code-review owns general diff review.
- txtrpg-qa owns acceptance evidence and regression verification.

Do not duplicate implementation rules from txtrpg-ui.
