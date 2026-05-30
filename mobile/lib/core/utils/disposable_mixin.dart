import 'dart:async';

import 'package:flutter/material.dart';

/// Mixin that provides a registry for disposable resources.
///
/// Usage:
/// ```dart
/// class _MyWidgetState extends State<MyWidget> with DisposableMixin {
///   late final AnimationController _ctrl;
///
///   @override
///   void initState() {
///     super.initState();
///     _ctrl = registerController(
///       AnimationController(vsync: this, duration: const Duration(milliseconds: 300)),
///     );
///   }
/// }
/// ```
///
/// All registered resources are automatically disposed when [dispose] is called.
mixin DisposableMixin<T extends StatefulWidget> on State<T> {
  final List<AnimationController> _controllers = [];
  final List<StreamSubscription<dynamic>> _subscriptions = [];
  final List<TextEditingController> _textControllers = [];
  final List<ScrollController> _scrollControllers = [];
  final List<FocusNode> _focusNodes = [];
  final List<Timer> _timers = [];
  final List<ChangeNotifier> _notifiers = [];

  /// Register an [AnimationController] for automatic disposal.
  AnimationController registerController(AnimationController controller) {
    _controllers.add(controller);
    return controller;
  }

  /// Register a [StreamSubscription] for automatic cancellation.
  StreamSubscription<S> registerSubscription<S>(StreamSubscription<S> sub) {
    _subscriptions.add(sub);
    return sub;
  }

  /// Register a [TextEditingController] for automatic disposal.
  TextEditingController registerTextController(TextEditingController ctrl) {
    _textControllers.add(ctrl);
    return ctrl;
  }

  /// Register a [ScrollController] for automatic disposal.
  ScrollController registerScrollController(ScrollController ctrl) {
    _scrollControllers.add(ctrl);
    return ctrl;
  }

  /// Register a [FocusNode] for automatic disposal.
  FocusNode registerFocusNode(FocusNode node) {
    _focusNodes.add(node);
    return node;
  }

  /// Register a [Timer] for automatic cancellation.
  Timer registerTimer(Timer timer) {
    _timers.add(timer);
    return timer;
  }

  /// Register a [ChangeNotifier] for automatic disposal.
  N registerNotifier<N extends ChangeNotifier>(N notifier) {
    _notifiers.add(notifier);
    return notifier;
  }

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    for (final s in _subscriptions) {
      s.cancel();
    }
    for (final t in _textControllers) {
      t.dispose();
    }
    for (final s in _scrollControllers) {
      s.dispose();
    }
    for (final f in _focusNodes) {
      f.dispose();
    }
    for (final t in _timers) {
      t.cancel();
    }
    for (final n in _notifiers) {
      n.dispose();
    }
    super.dispose();
  }
}