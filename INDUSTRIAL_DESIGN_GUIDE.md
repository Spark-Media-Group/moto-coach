# Industrial Motocross Design System Guide
**Moto Coach Website Styling Instructions**

This document provides comprehensive guidelines for styling pages on the Moto Coach website using our industrial motocross design system. Follow these patterns to maintain visual consistency across all pages.

---

## 🎨 Design Philosophy

**Theme:** Raw, industrial, motocross aesthetic  
**Style:** Sharp, angular, high-contrast with bold orange accents  
**Feel:** Powerful, professional, no-nonsense

---

## 📐 Core Design Principles

### 1. **Sharp Edges - NO Rounded Corners**
```css
/* ❌ NEVER USE */
border-radius: 20px;
border-radius: 12px;
border-radius: 999px;

/* ✅ ALWAYS USE */
border-radius: 0;
```

**Rule:** Every element must have sharp, angular edges. No exceptions for buttons, containers, cards, inputs, or images.

### 2. **Color Palette**

```css
:root {
    /* Primary Colors */
    --track-black: #0a0a0a;        /* Deep black backgrounds */
    --track-charcoal: #1a1a1a;     /* Secondary backgrounds */
    --track-steel: #2a2a2a;        /* Container backgrounds */
    --track-concrete: #3a3a3a;     /* Tertiary backgrounds */
    
    /* Text Colors */
    --track-white: #f8f8f8;        /* Primary text */
    --track-grey: rgba(248, 248, 248, 0.65); /* Secondary text */
    
    /* Accent Color */
    --track-orange: #ff6b35;       /* Primary accent - use sparingly */
    --track-orange-dark: #e55a28;  /* Darker orange for gradients */
    --track-orange-glow: rgba(255, 107, 53, 0.25); /* Glow effects */
}
```

### 3. **Typography**

```css
/* Headers - Always Oswald */
h1, h2, h3, h4, h5, h6,
.section-title,
.btn,
legend,
label {
    font-family: 'Oswald', sans-serif;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em; /* to 0.2em for labels */
}

/* Body Text - Always Roboto Condensed */
p, li, span, input, select, textarea {
    font-family: 'Roboto Condensed', sans-serif;
    font-weight: 400;
    color: var(--track-grey);
}
```

---

## 🏗️ Layout Components

### Page Container
```css
.page-main {
    font-family: 'Roboto Condensed', sans-serif;
    color: var(--track-white);
    background: var(--track-black);
    min-height: 100vh;
    position: relative;
}

/* Industrial texture overlay */
.page-main::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-image: 
        repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 255, 255, 0.01) 2px, rgba(255, 255, 255, 0.01) 4px),
        repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(255, 255, 255, 0.01) 2px, rgba(255, 255, 255, 0.01) 4px);
    opacity: 0.3;
    pointer-events: none;
    z-index: 0;
}
```

### Hero Section
```css
.hero-section {
    background: radial-gradient(ellipse at top left, rgba(255, 107, 53, 0.08), transparent 60%),
                radial-gradient(ellipse at bottom right, rgba(255, 107, 53, 0.05), transparent 50%),
                var(--track-charcoal);
    color: var(--track-white);
    padding: clamp(6rem, 12vw, 10rem) 1.5rem clamp(3rem, 6vw, 4rem);
    text-align: center;
    position: relative;
    border-bottom: 1px solid rgba(248, 248, 248, 0.08);
}

/* Orange accent line at bottom */
.hero-section::before {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 3px;
    background: linear-gradient(90deg, var(--track-orange), transparent);
}

.hero-section h1 {
    font-family: 'Oswald', sans-serif;
    font-size: clamp(2.5rem, 5vw, 4rem);
    font-weight: 700;
    text-transform: uppercase;
    position: relative;
    display: inline-block;
}

/* Orange underline accent */
.hero-section h1::after {
    content: '';
    position: absolute;
    bottom: -12px;
    left: 50%;
    transform: translateX(-50%);
    width: 80px;
    height: 3px;
    background: var(--track-orange);
    box-shadow: 0 0 20px rgba(255, 107, 53, 0.6);
}
```

### Containers & Cards
```css
.container-panel {
    background: linear-gradient(135deg, rgba(42, 42, 42, 0.8), rgba(26, 26, 26, 0.8));
    -webkit-backdrop-filter: blur(20px);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(248, 248, 248, 0.08);
    border-radius: 0;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.4);
    position: relative;
    overflow: hidden;
    padding: clamp(2rem, 4vw, 3rem);
}

/* Diagonal stripe pattern overlay */
.container-panel::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: repeating-linear-gradient(
        45deg,
        transparent,
        transparent 10px,
        rgba(255, 107, 53, 0.02) 10px,
        rgba(255, 107, 53, 0.02) 20px
    );
    pointer-events: none;
    z-index: 0;
}
```

---

## 🎯 Interactive Elements

### Buttons - Primary (Orange)
```css
.btn-primary {
    font-family: 'Oswald', sans-serif;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    border-radius: 0;
    border: 2px solid var(--track-orange);
    background: linear-gradient(135deg, var(--track-orange), var(--track-orange-dark));
    color: var(--track-white);
    padding: 1.25rem 3rem;
    cursor: pointer;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
    box-shadow: 
        0 4px 15px var(--track-orange-glow),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

/* Animated shimmer effect */
.btn-primary::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
    transition: left 0.5s ease;
}

.btn-primary:hover {
    background: linear-gradient(135deg, var(--track-orange-dark), var(--track-orange));
    box-shadow: 
        0 6px 25px rgba(255, 107, 53, 0.5),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
    transform: translateY(-2px);
    border-color: #ff8c5f;
}

.btn-primary:hover::before {
    left: 100%;
}

.btn-primary:active {
    transform: translateY(0);
    box-shadow: 
        0 2px 10px var(--track-orange-glow),
        inset 0 1px 3px rgba(0, 0, 0, 0.3);
}

.btn-primary:disabled {
    cursor: not-allowed;
    background: rgba(42, 42, 42, 0.6);
    border-color: rgba(248, 248, 248, 0.1);
    box-shadow: none;
    color: rgba(248, 248, 248, 0.3);
}
```

### Buttons - Secondary (Outlined)
```css
.btn-secondary {
    font-family: 'Oswald', sans-serif;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    padding: 0.85rem 2.25rem;
    border-radius: 0;
    background: transparent;
    color: var(--track-white);
    border: 2px solid rgba(248, 248, 248, 0.2);
    transition: all 0.3s ease;
}

.btn-secondary:hover {
    border-color: var(--track-white);
    background: rgba(248, 248, 248, 0.05);
}
```

### Form Inputs
```css
.form-group label {
    font-family: 'Oswald', sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--track-orange);
    letter-spacing: 0.2em;
    text-transform: uppercase;
    display: block;
    margin-bottom: 0.5rem;
}

.form-group input,
.form-group select,
.form-group textarea {
    border-radius: 0;
    border: 1px solid rgba(248, 248, 248, 0.1);
    border-left: 3px solid rgba(255, 107, 53, 0.3);
    padding: 0.95rem 1.15rem;
    font-size: 1rem;
    font-family: 'Roboto Condensed', sans-serif;
    background: rgba(42, 42, 42, 0.6);
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
    color: var(--track-white);
    transition: all 0.3s ease;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
    width: 100%;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
    outline: none;
    border-color: var(--track-orange);
    border-left-color: var(--track-orange);
    box-shadow: 
        inset 0 1px 3px rgba(0, 0, 0, 0.3),
        0 0 0 3px rgba(255, 107, 53, 0.15),
        0 0 20px rgba(255, 107, 53, 0.2);
    background: rgba(42, 42, 42, 0.9);
}
```

---

## 🎨 Visual Accents

### Section Headers
```css
.section-header h2 {
    font-family: 'Oswald', sans-serif;
    font-size: clamp(1.5rem, 3vw, 2rem);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--track-white);
    position: relative;
    z-index: 1;
}

/* Orange underline accent */
.section-header h2::after {
    content: '';
    display: block;
    width: 60px;
    height: 3px;
    background: var(--track-orange);
    margin-top: 0.75rem;
}
```

### Left Border Accent (for containers)
```css
.accent-left {
    border-left: 3px solid var(--track-orange);
    padding-left: 1.5rem;
}
```

### Animated Accent Lines
```css
@keyframes accentSlide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
}

.accent-line {
    position: relative;
    overflow: hidden;
}

.accent-line::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--track-orange), transparent);
    animation: accentSlide 3s ease-in-out infinite;
}
```

### Orange Glow Text
```css
.glow-text {
    color: var(--track-orange);
    text-shadow: 0 0 15px rgba(255, 107, 53, 0.3);
}
```

---

## 📱 Responsive Design

### Breakpoints
```css
/* Desktop: default styles */

/* Tablet and below */
@media (max-width: 1100px) {
    /* Adjust layouts, reduce padding */
}

/* Mobile */
@media (max-width: 768px) {
    /* Stack layouts, adjust typography */
}

/* Small mobile */
@media (max-width: 480px) {
    /* Further reduce sizing */
}
```

### Mobile Typography Scaling
```css
/* Use clamp() for responsive sizing */
font-size: clamp(min, preferred, max);

/* Examples */
h1 { font-size: clamp(2.5rem, 5vw, 4rem); }
p { font-size: clamp(1rem, 1.8vw, 1.15rem); }
```

---

## ✅ Checklist for New Pages

When styling a new page, ensure:

- [ ] Background is `var(--track-black)` or dark gradient
- [ ] All `border-radius` values are `0`
- [ ] Headers use `'Oswald', sans-serif`
- [ ] Body text uses `'Roboto Condensed', sans-serif`
- [ ] Orange (`#ff6b35`) is used only for accents, not large areas
- [ ] Containers have diagonal stripe pattern overlay
- [ ] Forms have orange left-border accent
- [ ] Buttons have sharp edges and proper hover states
- [ ] Text contrast meets accessibility standards
- [ ] Responsive breakpoints are implemented
- [ ] Industrial grid texture overlay on main container
- [ ] z-index layering is correct (overlays at 0, content at 1)

---

## 🚫 Common Mistakes to Avoid

### ❌ DON'T:
- Use rounded corners (`border-radius > 0`)
- Use soft, pastel colors
- Use Comic Sans, Helvetica, or serif fonts for body text
- Make backgrounds pure white
- Use pink or bright red as accents
- Add excessive shadows or blurs
- Create busy, cluttered layouts

### ✅ DO:
- Keep edges sharp and angular
- Use high contrast (dark backgrounds, light text)
- Apply orange sparingly for maximum impact
- Create breathing room with proper spacing
- Use subtle textures (diagonal stripes, grid patterns)
- Implement smooth hover transitions
- Layer with semi-transparent containers

---

## 📚 Reference Files

### Core Styling Files:
- `styles/track_reserve.css` - Complete industrial redesign reference
- `styles/index.css` - Homepage with partners section
- `styles/main.css` - Global navigation and base styles

### Example Implementations:
- **Track Reserve Page** (`programs/track_reserve.html`) - Full industrial theme
- **Homepage** (`index.html`) - Partners section with flexbox layout
- **Professional Coaching** (`programs/professional_coaching.html`) - Highlight cards

---

## 🎯 Quick Copy-Paste Snippets

### Container with Industrial Pattern
```css
.your-container {
    background: linear-gradient(135deg, rgba(42, 42, 42, 0.8), rgba(26, 26, 26, 0.8));
    backdrop-filter: blur(20px);
    border: 1px solid rgba(248, 248, 248, 0.08);
    border-radius: 0;
    position: relative;
    padding: 2rem;
}

.your-container::before {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255, 107, 53, 0.02) 10px, rgba(255, 107, 53, 0.02) 20px);
    pointer-events: none;
    z-index: 0;
}
```

### Orange Button
```css
.btn-orange {
    font-family: 'Oswald', sans-serif;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    padding: 1rem 2rem;
    border: 2px solid #ff6b35;
    background: linear-gradient(135deg, #ff6b35, #e55a28);
    color: #f8f8f8;
    border-radius: 0;
    transition: all 0.3s ease;
}

.btn-orange:hover {
    box-shadow: 0 0 25px rgba(255, 107, 53, 0.4);
    transform: translateY(-2px);
}
```

### Section Divider
```css
.section-divider {
    border-top: 1px solid rgba(255, 107, 53, 0.2);
    padding-top: 2rem;
    margin-top: 2rem;
}
```

---

## 🔄 Version History

- **v1.0** - Initial industrial design system established
- **v1.1** - Track reserve page complete redesign
- **v1.2** - Mobile partner section optimization (2 logos per row)

---

## 💡 Tips for Tools

1. **Always read this guide first** before styling any page
2. **Reference track_reserve.css** for complete working examples
3. **Test on mobile** - use responsive breakpoints properly
4. **Maintain consistency** - all pages should feel like part of the same family
5. **Use CSS variables** - defined at the top of each file
6. **Layer properly** - texture overlays at z-index: 0, content at z-index: 1
7. **Respect accessibility** - ensure sufficient color contrast
8. **Performance** - use backdrop-filter sparingly, optimize images

---

**Last Updated:** October 19, 2025  
**Maintained by:** Moto Coach Development Team  
**Questions?** Reference existing implementations in the codebase.
