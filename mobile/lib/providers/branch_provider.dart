import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_providers.dart';

const _kBranchIdKey = 'jedmee_active_division_id';

/// Active branch (division) for filtering transaction lists — persisted locally.
class BranchState {
  const BranchState({
    this.divisions = const [],
    this.selectedId,
    this.loaded = false,
  });

  final List<Map<String, dynamic>> divisions;
  final String? selectedId;
  final bool loaded;

  Map<String, dynamic>? get selected {
    if (selectedId == null) return null;
    for (final d in divisions) {
      if (d['id']?.toString() == selectedId) return d;
    }
    return null;
  }

  String get selectedLabel {
    if (selectedId == null) return 'All divisions';
    return (selected?['name'] ?? selected?['division_name'] ?? 'Division').toString();
  }

  BranchState copyWith({
    List<Map<String, dynamic>>? divisions,
    String? selectedId,
    bool clearSelection = false,
    bool? loaded,
  }) {
    return BranchState(
      divisions: divisions ?? this.divisions,
      selectedId: clearSelection ? null : (selectedId ?? this.selectedId),
      loaded: loaded ?? this.loaded,
    );
  }
}

class BranchController extends StateNotifier<BranchState> {
  BranchController(this._ref) : super(const BranchState());

  final Ref _ref;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_kBranchIdKey);
    final resp = await _ref.read(divisionRepositoryProvider).list({
      'sortBy': 'name',
      'sortDir': 'asc',
      'isActive': true,
    });
    final rows = <Map<String, dynamic>>[];
    if (resp.ok && resp.data is Map) {
      final data = resp.data as Map;
      final raw = data['divisions'] ?? data['items'] ?? data['rows'];
      if (raw is List) {
        rows.addAll(raw.whereType<Map>().map(Map<String, dynamic>.from));
      }
    }
    state = BranchState(
      divisions: rows,
      selectedId: saved,
      loaded: true,
    );
  }

  Future<void> select(String? divisionId) async {
    final prefs = await SharedPreferences.getInstance();
    if (divisionId == null || divisionId.isEmpty) {
      await prefs.remove(_kBranchIdKey);
      state = state.copyWith(clearSelection: true);
    } else {
      await prefs.setString(_kBranchIdKey, divisionId);
      state = state.copyWith(selectedId: divisionId);
    }
  }
}

final branchControllerProvider =
    StateNotifierProvider<BranchController, BranchState>((ref) {
  final c = BranchController(ref);
  return c;
});

/// Query params for APIs that support division_id filter.
Map<String, String> branchQueryParams(BranchState branch) {
  if (branch.selectedId == null || branch.selectedId!.isEmpty) {
    return {};
  }
  return {'division_id': branch.selectedId!};
}
