# Modal Animation System — JedMee Mobile

Unified animation specification for all modal surfaces in the app.
All tokens live in [`ModalAnimationTokens`](lib/core/theme/modal_animation_tokens.dart)
and the dispatcher widget is [`AppAnimatedModal`](lib/widgets/app_animated_modal.dart).

---

## Token Reference

| Token | Value | Usage |
|---|---|---|
| `durationOpen` | 320 ms | Enter transition |
| `durationClose` | 240 ms | Exit transition |
| `durationReducedMotion` | 150 ms | Accessibility fallback |
| `durationStagger` | 40 ms | Per-child stagger delay |
| `backdropOpacity` | 0.55 | Barrier colour alpha |
| `curveOpen` | `easeOutCubic` | Enter easing |
| `curveClose` | `easeInCubic` | Exit easing |
| `curveSpring` | `elasticOut` | Drawer overshoot |

---

## Animation Types

### 1. Center Modal (`AppModalType.center`)

Used for: alert dialogs, confirmation dialogs, bulk-action dialogs.

```
t=0ms                t=160ms              t=320ms
  ┌──────────┐         ┌──────────┐         ┌──────────┐
  │          │  scale  │          │  scale  │  ╔════╗  │
  │          │ 0.85→1  │  ╔════╗  │  1.0    │  ║    ║  │
  │          │ + fade  │  ║    ║  │  opaque │  ║    ║  │
  │          │  0→1    │  ╚════╝  │         │  ╚════╝  │
  └──────────┘         └──────────┘         └──────────┘
  opacity: 0           opacity: 0.5         opacity: 1.0
  scale:   0.85        scale:   0.93        scale:   1.0
```

**Curve:** `easeOutCubic` (enter) / `easeInCubic` (exit)
**Duration:** 320 ms open · 240 ms close · 150 ms reduced-motion

**Call site pattern:**
```dart
final reduceMotion = MediaQuery.of(context).disableAnimations;
showGeneralDialog<T>(
  context: context,
  barrierDismissible: true,
  barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
  barrierColor: Colors.black.withOpacity(ModalAnimationTokens.backdropOpacity),
  transitionDuration: reduceMotion
      ? ModalAnimationTokens.durationReducedMotion
      : ModalAnimationTokens.durationOpen,
  pageBuilder: (ctx, anim, _) => Center(child: AlertDialog(...)),
  transitionBuilder: (ctx, anim, _, child) =>
      AppAnimatedModal(type: AppModalType.center, animation: anim, child: child),
);
```

---

### 2. Bottom Sheet (`AppModalType.bottom`)

Used for: payment sheets, filter sheets, form sheets, picker sheets.

```
t=0ms                t=160ms              t=320ms
  ┌──────────┐         ┌──────────┐         ┌──────────┐
  │          │         │          │         │          │
  │          │  slide  │          │  slide  │          │
  │          │  up +   │  ┌────┐  │  up     │  ┌────┐  │
  │          │  fade   │  │    │  │  done   │  │    │  │
  └──────────┘         └──┴────┴──┘         └──┴────┴──┘
  dy: +1.0             dy: +0.5             dy:  0.0
  opacity: 0           opacity: 0.5         opacity: 1.0
```

**Curve:** `easeOutCubic` (enter) / `easeInCubic` (exit)
**Duration:** 320 ms open · 240 ms close · 150 ms reduced-motion

**Call site pattern:**
```dart
showAppBottomSheet<T>(
  context: context,
  builder: (_) => MySheetWidget(...),
);
```

[`showAppBottomSheet`](lib/widgets/app_bottom_sheet.dart) wraps `showGeneralDialog` +
`AppAnimatedModal(type: AppModalType.bottom, ...)` internally.

---

### 3. Drawer (`AppModalType.drawer`)

Used for: the main navigation drawer (`AppDrawer`).

```
t=0ms                t=160ms              t=320ms
  ┌──────────┐         ┌──────────┐         ┌──────────┐
  │          │  slide  │┌──┐      │  spring │┌────┐    │
  │          │  right  ││  │      │  over-  ││    │    │
  │          │  + fade ││  │      │  shoot  ││    │    │
  │          │         │└──┘      │         │└────┘    │
  └──────────┘         └──────────┘         └──────────┘
  dx: -1.0             dx: -0.5             dx:  0.0
  opacity: 0           opacity: 0.5         opacity: 1.0
```

**Curve:** `elasticOut` (enter — spring overshoot) / `easeInCubic` (exit)
**Duration:** 320 ms open · 240 ms close · 150 ms reduced-motion

**Call site pattern:**
```dart
showAppDrawer(context);
```

[`showAppDrawer`](lib/widgets/app_drawer.dart) uses `showGeneralDialog` +
`AppAnimatedModal(type: AppModalType.drawer, ...)` with
`Align(alignment: Alignment.centerLeft)` to pin the panel to the left edge.

---

### 4. Toast (`AppModalType.toast`)

Used for: success / error / info snack messages.

```
t=0ms        t=80ms       t=200ms      t=2800ms     t=3000ms
  ┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐
  │      │ ↑  │      │ ↑  │[msg] │    │[msg] │ ↓  │      │
  │      │    │[msg] │    │      │    │      │    │      │
  └──────┘    └──────┘    └──────┘    └──────┘    └──────┘
  dy: +0.5    dy: +0.2    dy:  0.0    dy:  0.0    dy: -0.3
  opacity: 0  opacity:0.6 opacity:1   opacity:1   opacity: 0
```

**Curve:** `easeOutCubic` (enter) / `easeInCubic` (exit)
**Duration:** 200 ms enter · 200 ms exit · auto-dismiss after 2.8 s
**Position:** bottom-centre, above system nav bar

**Call site pattern:**
```dart
showAppToast(context, message: 'Saved', type: AppToastType.success);
// or via the snackbar helper:
showAppSnack(context, message: 'Saved', type: AppSnackType.success);
```

---

### 5. Tooltip (`AppModalType.tooltip`)

Used for: contextual help bubbles, info popovers.

```
t=0ms        t=120ms      t=240ms
  ┌──────┐    ┌──────┐    ┌──────┐
  │      │    │ ╔══╗ │    │ ╔══╗ │
  │      │ ↑  │ ║  ║ │    │ ║  ║ │
  │      │    │ ╚══╝ │    │ ╚══╝ │
  └──────┘    └──────┘    └──────┘
  scale: 0.7  scale: 0.9  scale: 1.0
  opacity: 0  opacity:0.6 opacity: 1
```

**Curve:** `easeOutCubic` (enter) / `easeInCubic` (exit)
**Duration:** 240 ms open · 180 ms close · 150 ms reduced-motion

---

### 6. Fullscreen (`AppModalType.fullscreen`)

Used for: camera scanner, full-screen forms, media viewers.

```
t=0ms                t=160ms              t=320ms
  ┌──────────┐         ┌──────────┐         ┌──────────┐
  │          │  fade   │          │  fade   │██████████│
  │          │  0→1    │          │  0.5→1  │██████████│
  │          │         │██████████│         │██████████│
  │          │         │██████████│         │██████████│
  └──────────┘         └──────────┘         └──────────┘
  opacity: 0           opacity: 0.5         opacity: 1.0
```

**Curve:** `easeOutCubic` (enter) / `easeInCubic` (exit)
**Duration:** 320 ms open · 240 ms close · 150 ms reduced-motion
**Note:** Pure opacity fade — no translate/scale to avoid disorientation.

**Call site pattern:**
```dart
showGeneralDialog(
  context: context,
  barrierDismissible: false,
  barrierColor: Colors.black,
  transitionDuration: ModalAnimationTokens.durationOpen,
  pageBuilder: (ctx, anim, _) => MyFullscreenWidget(),
  transitionBuilder: (ctx, anim, _, child) =>
      AppAnimatedModal(type: AppModalType.fullscreen, animation: anim, child: child),
);
```

---

## Content Stagger (`ModalContentFadeIn`)

Children inside a modal can opt into a staggered fade-in using
[`ModalContentFadeIn`](lib/widgets/app_animated_modal.dart):

```
Modal enters (t=0)
  │
  ├─ child[0] fades in at t = 0 ms  + 0×40 ms  = 0 ms
  ├─ child[1] fades in at t = 0 ms  + 1×40 ms  = 40 ms
  ├─ child[2] fades in at t = 0 ms  + 2×40 ms  = 80 ms
  └─ child[n] fades in at t = 0 ms  + n×40 ms
```

**Usage:**
```dart
ModalContentFadeIn(
  index: 0,   // stagger slot
  child: Text('Title'),
),
ModalContentFadeIn(
  index: 1,
  child: TextField(...),
),
```

---

## Reduce-Motion Fallback

When `MediaQuery.of(context).disableAnimations` is `true` (system accessibility
setting), all transitions collapse to a **150 ms opacity-only** fade — no
translate, scale, or spring effects.

This is handled automatically inside each private transition widget in
[`app_animated_modal.dart`](lib/widgets/app_animated_modal.dart). Call sites
only need to pass the correct `transitionDuration`:

```dart
transitionDuration: MediaQuery.of(context).disableAnimations
    ? ModalAnimationTokens.durationReducedMotion   // 150 ms
    : ModalAnimationTokens.durationOpen,           // 320 ms
```

---

## File Map

| File | Role |
|---|---|
| [`lib/core/theme/modal_animation_tokens.dart`](lib/core/theme/modal_animation_tokens.dart) | All timing & curve constants |
| [`lib/widgets/app_animated_modal.dart`](lib/widgets/app_animated_modal.dart) | Dispatcher widget + 6 private transition widgets + `ModalContentFadeIn` |
| [`lib/widgets/app_bottom_sheet.dart`](lib/widgets/app_bottom_sheet.dart) | `showAppBottomSheet()` convenience wrapper |
| [`lib/widgets/app_toast.dart`](lib/widgets/app_toast.dart) | `showAppToast()` overlay-based toast |
| [`lib/widgets/app_drawer.dart`](lib/widgets/app_drawer.dart) | `showAppDrawer()` + `AppDrawer` widget |
| [`lib/widgets/snackbar.dart`](lib/widgets/snackbar.dart) | `showAppSnack()` → delegates to `showAppToast()` |
| [`lib/widgets/confirm_dialog.dart`](lib/widgets/confirm_dialog.dart) | `showConfirmDialog()` using `AppModalType.center` |
| [`lib/widgets/loading_overlay.dart`](lib/widgets/loading_overlay.dart) | Loading spinner using `AppModalType.center` |