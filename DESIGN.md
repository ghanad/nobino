---
name: Nobino
description: A restrained Persian operational interface for everyday workplace reservations.
colors:
  action-blue: "hsl(221.2 83.2% 53.3%)"
  action-on-blue: "hsl(210 40% 98%)"
  canvas-white: "hsl(0 0% 100%)"
  ink-navy: "hsl(222.2 84% 4.9%)"
  quiet-surface: "hsl(210 40% 96.1%)"
  quiet-ink: "hsl(215.4 16.3% 46.9%)"
  rule-blue-gray: "hsl(214.3 31.8% 91.4%)"
  danger-red: "hsl(0 84.2% 60.2%)"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
typography:
  headline:
    fontFamily: "IRANSansX, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "normal"
  title:
    fontFamily: "IRANSansX, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "normal"
  body:
    fontFamily: "IRANSansX, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "normal"
  label:
    fontFamily: "IRANSansX, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "normal"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.action-on-blue}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-outline:
    backgroundColor: "{colors.canvas-white}"
    textColor: "{colors.ink-navy}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.canvas-white}"
    textColor: "{colors.ink-navy}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "40px"
---

# Design System: Nobino

## Overview

**Creative North Star: "The Quiet Service Desk"**

Nobino behaves like a well-run internal service counter: composed, predictable, and quick to scan. The interface is deliberately operational rather than promotional. Hierarchy comes from spacing, weight, alignment, and restrained blue emphasis instead of decorative surfaces.

Persian right-to-left reading order is native to every composition. Dense workflows remain calm through clear section boundaries, modest typography, and familiar controls. Expression belongs in information architecture and precise interaction details, never at the expense of task state.

**Key Characteristics:**

- Persian-first, right-to-left composition
- Restrained blue action color over white and cool neutral surfaces
- Compact, readable information density
- Borders and tonal shifts before shadows
- Familiar controls with explicit focus and state feedback

## Colors

The palette is cool, restrained, and role-driven: blue identifies action, near-navy carries primary text, and pale blue-gray separates operational surfaces.

### Primary

- **Action Blue:** Reserved for primary actions, active emphasis, links, and focus.

### Neutral

- **Canvas White:** The default page and card ground.
- **Ink Navy:** Primary text with firm contrast.
- **Quiet Surface:** Secondary regions, selected navigation, and low-emphasis groupings.
- **Quiet Ink:** Supporting copy and metadata.
- **Rule Blue-Gray:** Borders, dividers, and input outlines.

### Named Rules

**The One Action Color Rule.** Blue communicates action or active state; it is not scattered as decoration.

**The Status Is Semantic Rule.** Success, warning, and danger colors appear only when the underlying state warrants them.

## Typography

**Display Font:** IRANSansX (with sans-serif fallback)  
**Body Font:** IRANSansX (with sans-serif fallback)

**Character:** A single Persian workhorse family keeps labels, dates, and dense operational content consistent. Hierarchy is made with size and weight, not a competing display face.

### Hierarchy

- **Headline:** Semibold page titles with natural Persian tracking.
- **Title:** Semibold service, section, and card names.
- **Body:** Regular explanatory copy with generous Persian line height.
- **Label:** Medium-weight controls, navigation, and compact metadata.

### Named Rules

**The Natural Persian Rule.** Do not add Latin-style tracking, uppercase conventions, or ornamental italics to Persian interface text.

## Layout

Content sits in a centered wide container with compact page padding and a consistent vertical rhythm. Desktop layouts may use multiple columns when comparison benefits; mobile collapses to a single clear reading path with touch targets at least 44px high. More space appears above a new section than between its heading and content.

RTL alignment is structural, not cosmetic: primary reading and action flow begins on the right, while directional icons and secondary metadata occupy the opposite edge.

## Elevation & Depth

The system is flat by default. Borders and cool tonal layering establish grouping; low shadows are reserved for overlays, floating notifications, active menus, and the occasional contained workspace that genuinely sits above its surroundings.

**The Flat-at-Rest Rule.** Ordinary cards and controls do not need a shadow to exist.

## Shapes

Controls and containers use gently curved corners, primarily medium and large radii. Small nested controls may tighten their corners, while circles are reserved for avatars, counts, dots, or controls whose geometry is inherently round.

Borders remain crisp and thin. Avoid stacking several rounded containers when spacing or a divider can express the relationship.

## Components

### Buttons

- **Shape:** Compact medium corners with a 40px desktop height and 44px mobile touch target where space permits.
- **Primary:** Solid Action Blue with high-contrast light text.
- **Hover / Focus:** A modest tonal shift on hover and a visible two-pixel focus ring.
- **Secondary / Ghost:** White or transparent surfaces with border or tonal hover feedback.

### Cards / Containers

- **Corner Style:** Gently curved large corners.
- **Background:** White or a low-emphasis neutral grouping.
- **Shadow Strategy:** Flat at rest; overlays alone receive clear elevation.
- **Border:** Thin blue-gray rule.
- **Internal Padding:** Usually 16–24px.

### Inputs / Fields

- **Style:** White background, thin outline, medium corners, and compact horizontal padding.
- **Focus:** A visible blue ring without shifting layout.
- **Error / Disabled:** Semantic color and explanatory copy; never color alone.

### Navigation

Navigation is compact and text-led. Active items use a quiet neutral field and stronger ink rather than a saturated pill. Desktop dropdowns are bordered and lightly elevated; mobile navigation becomes a full-height drawer with clear grouped sections.

### Service Routes

Service gateways use a recognizable icon, direct Persian title, one concise job description, and a directional affordance. The entire route surface is interactive and must retain a visible keyboard focus state.

## Do's and Don'ts

### Do:

- **Do** prioritize service recognition and current task state over decorative content.
- **Do** use spacing, borders, and weight to establish hierarchy.
- **Do** keep Persian labels concise and dates naturally ordered in Jalali form.
- **Do** preserve familiar links, buttons, inputs, and keyboard behavior.

### Don't:

- **Don't** turn every grouping into a floating card.
- **Don't** introduce gradients, glass effects, ornamental serif typography, or generic marketing copy.
- **Don't** use muted text where the contrast becomes ambiguous.
- **Don't** replace explicit status language with color or icons alone.
