# US Training Camp - Color Update Summary

## Changes Made
Updated all red accent colors to match the brand's orange color scheme (#ff6b35).

## CSS Variables Updated
```css
/* BEFORE */
--us-red: #d32f2f;
--us-red-glow: rgba(211, 47, 47, 0.25);

/* AFTER */
--us-orange: #ff6b35;
--us-orange-glow: rgba(255, 107, 53, 0.25);
```

## All Instances Replaced

### Throughout the file:
- All `var(--us-red)` → `var(--us-orange)`
- All `var(--us-red-glow)` → `var(--us-orange-glow)`

### Specific RGBA replacements:
1. **Opening Section Background**
   - `rgba(211, 47, 47, 0.08)` → `rgba(255, 107, 53, 0.08)`
   - `rgba(211, 47, 47, 0.05)` → `rgba(255, 107, 53, 0.05)`

2. **Stat Blocks**
   - Background gradient: `rgba(211, 47, 47, 0.05)` → `rgba(255, 107, 53, 0.05)`
   - Hover gradient: `rgba(211, 47, 47, 0.1)` → `rgba(255, 107, 53, 0.1)`
   - Border hover: `rgba(211, 47, 47, 0.4)` → `rgba(255, 107, 53, 0.4)`
   - Box shadow: `rgba(211, 47, 47, 0.2)` → `rgba(255, 107, 53, 0.2)`
   - Text shadow: `rgba(211, 47, 47, 0.5)` → `rgba(255, 107, 53, 0.5)`

3. **Package Cards**
   - Border hover: `rgba(211, 47, 47, 0.4)` → `rgba(255, 107, 53, 0.4)`
   - Note background: `rgba(211, 47, 47, 0.08)` → `rgba(255, 107, 53, 0.08)`

4. **Facility Items**
   - Border hover: `rgba(211, 47, 47, 0.3)` → `rgba(255, 107, 53, 0.3)`
   - Background gradient: `rgba(211, 47, 47, 0.05)` → `rgba(255, 107, 53, 0.05)`
   - Box shadow: `rgba(211, 47, 47, 0.15)` → `rgba(255, 107, 53, 0.15)`

5. **Info Blocks**
   - Gradient: `rgba(211, 47, 47, 0.1)` → `rgba(255, 107, 53, 0.1)`
   - Border hover: `rgba(211, 47, 47, 0.4)` → `rgba(255, 107, 53, 0.4)`
   - Background hover: `rgba(211, 47, 47, 0.05)` → `rgba(255, 107, 53, 0.05)`
   - Text shadow: `rgba(211, 47, 47, 0.6)` → `rgba(255, 107, 53, 0.6)`

## Elements Affected
- Eyebrow text color
- Primary button background
- Primary button hover glow
- Partnership section accent
- Opening section background gradients
- Stat block numbers and hover effects
- Package card accents and hover states
- Package tags background
- Package button borders
- Package note backgrounds
- Facility item hover effects
- Info block hover effects
- All accent lines and borders

## Result
✅ Complete brand consistency with orange (#ff6b35) across the entire US Training Camp page!
