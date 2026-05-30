import 'package:jedmee_mobile/core/api/api_client.dart';
import 'package:jedmee_mobile/core/api/api_response.dart';

class PurchaseRepository {
  PurchaseRepository(this._client);

  final ApiClient _client;

  // --- Purchase invoices ---

  Future<ApiResponse> listPurchaseInvoices([Map<String, dynamic>? params]) {
    return _client.get('/purchase-invoices', params: params);
  }

  /// Lightweight list of in-progress (DRAFT) purchase invoices for the
  /// parallel-data-entry rail at the top of the purchase screens.
  Future<ApiResponse> listOngoingPurchaseInvoices([Map<String, dynamic>? params]) {
    return _client.get('/purchase-invoices/ongoing', params: params);
  }

  Future<ApiResponse> getPurchaseInvoice(Object id) {
    return _client.get('/purchase-invoices/${Uri.encodeComponent(id.toString())}');
  }

  Future<ApiResponse> createPurchaseInvoice([Map<String, dynamic>? payload]) {
    return _client.post('/purchase-invoices', payload ?? {});
  }

  Future<ApiResponse> updatePurchaseInvoice(
    Object id, [
    Map<String, dynamic>? payload,
  ]) {
    return _client.put(
      '/purchase-invoices/${Uri.encodeComponent(id.toString())}',
      payload ?? {},
    );
  }

  Future<ApiResponse> confirmPurchaseInvoice(
    Object id, [
    Map<String, dynamic>? payload,
  ]) {
    return _client.post(
      '/purchase-invoices/${Uri.encodeComponent(id.toString())}/confirm',
      payload ?? {},
    );
  }

  Future<ApiResponse> cancelPurchaseInvoice(
    Object id, [
    Map<String, dynamic>? payload,
  ]) {
    return _client.post(
      '/purchase-invoices/${Uri.encodeComponent(id.toString())}/cancel',
      payload ?? {},
    );
  }

  Future<ApiResponse> deletePurchaseInvoice(Object id) {
    return _client.post(
      '/purchase-invoices/${Uri.encodeComponent(id.toString())}/delete',
      {},
    );
  }

  Future<ApiResponse> bulkCancelPurchaseInvoices(
    List<Object> ids, [
    Map<String, dynamic>? payload,
  ]) {
    return _client.post('/purchase-invoices/bulk-cancel', {
      'ids': ids,
      ...?payload,
    });
  }

  Future<ApiResponse> bulkConfirmPurchaseInvoices([Map<String, dynamic>? payload]) {
    return _client.post('/purchase-invoices/bulk-confirm', payload ?? {});
  }

  Future<ApiResponse> printPurchaseInvoice(Object id) {
    return _client.get(
      '/purchase-invoices/${Uri.encodeComponent(id.toString())}/print',
    );
  }

  Future<ApiResponse> sendPurchaseInvoicesByEmail([Map<String, dynamic>? body]) {
    return _client.post('/purchase-invoices/send-email', body ?? {});
  }

  // --- Purchase returns ---

  Future<ApiResponse> listPurchaseReturns([Map<String, dynamic>? params]) {
    return _client.get('/purchase-returns', params: params);
  }

  Future<ApiResponse> getPurchaseReturn(Object id) {
    return _client.get('/purchase-returns/${Uri.encodeComponent(id.toString())}');
  }

  Future<ApiResponse> createPurchaseReturn([Map<String, dynamic>? payload]) {
    return _client.post('/purchase-returns', payload ?? {});
  }

  Future<ApiResponse> confirmPurchaseReturn(
    Object id, [
    Map<String, dynamic>? payload,
  ]) {
    return _client.post(
      '/purchase-returns/${Uri.encodeComponent(id.toString())}/confirm',
      payload ?? {},
    );
  }
}
