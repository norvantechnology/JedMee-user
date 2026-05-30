import 'package:jedmee_mobile/core/api/api_client.dart';
import 'package:jedmee_mobile/core/api/api_response.dart';

class SalesRepository {
  SalesRepository(this._client);

  final ApiClient _client;

  // --- Sales invoices ---

  Future<ApiResponse> listSalesInvoices([Map<String, dynamic>? params]) {
    return _client.get('/sales-invoices', params: params);
  }

  /// Lightweight list of in-progress (DRAFT) sales invoices for the parallel
  /// billing counter UI. Returns customer name, bill #, item count, total, etc.
  Future<ApiResponse> listOngoingSalesInvoices([Map<String, dynamic>? params]) {
    return _client.get('/sales-invoices/ongoing', params: params);
  }

  Future<ApiResponse> getSalesInvoice(Object id) {
    return _client.get('/sales-invoices/${Uri.encodeComponent(id.toString())}');
  }

  Future<ApiResponse> createSalesInvoice([Map<String, dynamic>? payload]) {
    return _client.post('/sales-invoices', payload ?? {});
  }

  Future<ApiResponse> updateSalesInvoice(
    Object id, [
    Map<String, dynamic>? payload,
  ]) {
    return _client.put(
      '/sales-invoices/${Uri.encodeComponent(id.toString())}',
      payload ?? {},
    );
  }

  Future<ApiResponse> changeSalesInvoiceRateType(Object id, String rateType) {
    return _client.patch(
      '/sales-invoices/${Uri.encodeComponent(id.toString())}/rate-type',
      {'rateType': rateType},
    );
  }

  Future<ApiResponse> applySalesInvoiceGlobalDiscount(
    Object id,
    num globalDiscountPercent,
  ) {
    return _client.patch(
      '/sales-invoices/${Uri.encodeComponent(id.toString())}/global-discount',
      {'globalDiscountPercent': globalDiscountPercent},
    );
  }

  Future<ApiResponse> overrideSalesInvoiceItemScheme(
    Object id,
    Object itemId, [
    Map<String, dynamic>? payload,
  ]) {
    return _client.post(
      '/sales-invoices/${Uri.encodeComponent(id.toString())}/items/${Uri.encodeComponent(itemId.toString())}/scheme',
      payload ?? {},
    );
  }

  Future<ApiResponse> recordSalesInvoiceLooseSale(
    Object id, [
    Map<String, dynamic>? payload,
  ]) {
    return _client.post(
      '/sales-invoices/${Uri.encodeComponent(id.toString())}/loose-sale',
      payload ?? {},
    );
  }

  Future<ApiResponse> confirmSalesInvoice(
    Object id, [
    Map<String, dynamic>? payload,
  ]) {
    return _client.post(
      '/sales-invoices/${Uri.encodeComponent(id.toString())}/confirm',
      payload ?? {},
    );
  }

  Future<ApiResponse> cancelSalesInvoice(
    Object id, [
    Map<String, dynamic>? payload,
  ]) {
    return _client.post(
      '/sales-invoices/${Uri.encodeComponent(id.toString())}/cancel',
      payload ?? {},
    );
  }

  /// Hard-delete a DRAFT sales invoice. Only valid for DRAFT status.
  Future<ApiResponse> deleteSalesInvoice(Object id) {
    return _client.delete(
      '/sales-invoices/${Uri.encodeComponent(id.toString())}',
      {},
    );
  }

  Future<ApiResponse> bulkCancelSalesInvoices(
    List<Object> ids, [
    Map<String, dynamic>? payload,
  ]) {
    return _client.post('/sales-invoices/bulk-cancel', {
      'ids': ids,
      ...?payload,
    });
  }

  Future<ApiResponse> bulkConfirmSalesInvoices([Map<String, dynamic>? payload]) {
    return _client.post('/sales-invoices/bulk-confirm', payload ?? {});
  }

  Future<ApiResponse> printSalesInvoice(Object id) {
    return _client.get(
      '/sales-invoices/${Uri.encodeComponent(id.toString())}/print',
    );
  }

  Future<ApiResponse> sendSalesInvoicesByEmail([Map<String, dynamic>? body]) {
    return _client.post('/sales-invoices/send-email', body ?? {});
  }

  Future<ApiResponse> bulkPrintSalesInvoices(List<Object> ids) {
    return _client.post('/sales-invoices/print-bulk', {'ids': ids});
  }

  Future<ApiResponse> findSalesBatchByBarcode(String barcode) {
    return _client.get('/sales-invoices/by-barcode', params: {'barcode': barcode});
  }

  // --- Sales returns ---

  Future<ApiResponse> listSalesReturns([Map<String, dynamic>? params]) {
    return _client.get('/sales-returns', params: params);
  }

  Future<ApiResponse> getSalesReturn(Object id) {
    return _client.get('/sales-returns/${Uri.encodeComponent(id.toString())}');
  }

  Future<ApiResponse> createSalesReturn([Map<String, dynamic>? payload]) {
    return _client.post('/sales-returns', payload ?? {});
  }

  Future<ApiResponse> confirmSalesReturn(
    Object id, [
    Map<String, dynamic>? payload,
  ]) {
    return _client.post(
      '/sales-returns/${Uri.encodeComponent(id.toString())}/confirm',
      payload ?? {},
    );
  }

  Future<ApiResponse> cancelSalesReturn(
    Object id, [
    Map<String, dynamic>? payload,
  ]) {
    return _client.post(
      '/sales-returns/${Uri.encodeComponent(id.toString())}/cancel',
      payload ?? {},
    );
  }
}
