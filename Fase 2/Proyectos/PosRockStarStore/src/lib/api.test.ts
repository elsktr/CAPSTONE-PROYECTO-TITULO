import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from './api';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('api client', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('salud', () => {
    it('returns true when backend responds ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ estado: 'ok' }),
      });
      const result = await api.salud();
      expect(result).toBe(true);
    });

    it('returns false when backend responds not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ estado: 'error' }),
      });
      const result = await api.salud();
      expect(result).toBe(false);
    });
  });

  describe('login', () => {
    it('returns session on valid credentials', async () => {
      const mockSession = {
        accessToken: 'token123',
        refreshToken: 'refresh123',
        usuario: { id: 1, nombre: 'Vendedor', email: 'vendedor@rockstar.cl', rol: 'VENDEDOR' },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockSession),
      });
      const result = await api.login('vendedor@rockstar.cl', 'password');
      expect(result).toEqual(mockSession);
    });

    it('throws error with API message on invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ mensaje: 'Credenciales inválidas' }),
      });
      await expect(api.login('wrong@rockstar.cl', 'wrong')).rejects.toThrow('Credenciales inválidas');
    });
  });

  describe('getCatalogo', () => {
    it('returns catalog array', async () => {
      const mockCatalog = [
        {
          idVariante: 1,
          idProducto: 1,
          sku: 'SKU001',
          producto: 'Polera',
          categoria: 'Ropa',
          banda: 'Rockstar',
          talla: 'M',
          color: 'Negro',
          precio: 15000,
          descripcion: 'Polera oficial',
          imagenUrl: 'https://example.com/img.jpg',
          disponible: 10,
        },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockCatalog),
      });
      const result = await api.getCatalogo();
      expect(result).toEqual(mockCatalog);
    });
  });

  describe('getProductos', () => {
    it('returns management products with token', async () => {
      const mockProducts = [
        {
          id: 1,
          idProducto: 1,
          sku: 'SKU001',
          codigo: 'COD001',
          producto: 'Polera',
          categoria: 'Ropa',
          banda: 'Rockstar',
          talla: 'M',
          color: 'Negro',
          precio: 15000,
          descripcion: 'Polera oficial',
          stockTotal: 20,
          disponible: 10,
        },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockProducts),
      });
      const result = await api.getProductos('vendor-token');
      expect(result).toEqual(mockProducts);
    });
  });

  describe('buscarVariantes', () => {
    it('searches variants with query and token', async () => {
      const mockVariants = [
        {
          id: 1,
          idProducto: 1,
          sku: 'SKU001',
          codigo: 'COD001',
          producto: 'Polera',
          categoria: 'Ropa',
          banda: 'Rockstar',
          talla: 'M',
          color: 'Negro',
          precio: 15000,
          descripcion: 'Polera oficial',
          stockTotal: 20,
          disponible: 10,
        },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockVariants),
      });
      const result = await api.buscarVariantes('vendor-token', 'polera');
      expect(result).toEqual(mockVariants);
    });
  });

  describe('crearCheckout', () => {
    it('creates checkout with idempotency key and client token', async () => {
      const mockResponse = {
        idVenta: 100,
        subtotal: 30000,
        flete: 0,
        total: 30000,
        tokenPago: 'payment-token-123',
        expiraEn: '2024-12-31T23:59:59Z',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockResponse),
      });
      const request = {
        claveIdempotencia: 'uuid-123',
        lineas: [{ idVariante: 1, cantidad: 2 }],
        despacho: { tipo: 'retiro' as const, comuna: 'Santiago', direccion: 'Av. Principal 123' },
      };
      const result = await api.crearCheckout('client-token', request);
      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/ventas/checkout'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer client-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(request),
        })
      );
    });

    it('throws on stock insufficient error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: async () => JSON.stringify({ mensaje: 'Stock insuficiente para variante 1' }),
      });
      await expect(
        api.crearCheckout('client-token', {
          claveIdempotencia: 'uuid-123',
          lineas: [{ idVariante: 1, cantidad: 999 }],
          despacho: { tipo: 'retiro', comuna: 'Santiago', direccion: 'Av. Principal 123' },
        })
      ).rejects.toThrow('Stock insuficiente');
    });
  });

  describe('retornoPago', () => {
    it('approves payment immediately for contado', async () => {
      const mockResponse = {
        estado: 'aprobado',
        idVenta: 100,
        total: 30000,
        idPedido: 50,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockResponse),
      });
      const result = await api.retornoPago('client-token', { tokenPago: 'payment-token-123', aprobar: true });
      expect(result).toEqual(mockResponse);
    });

    it('returns rejection with motivo for tarjeta rechazada', async () => {
      const mockResponse = {
        estado: 'rechazado',
        idVenta: 100,
        total: 30000,
        motivo: 'Tarjeta rechazada por el banco',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockResponse),
      });
      const result = await api.retornoPago('client-token', { tokenPago: 'payment-token-123', aprobar: false });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getImageUrl', () => {
    it('resuelve fotos del backend al mismo origen del POS', () => {
      expect(api.getImageUrl({ imagenUrl: 'assets/prendas/polera-eddie.webp' })).toBe(
        '/prendas/polera-eddie.webp'
      );
    });

    it('mantiene URLs absolutas y data URIs tal cual', () => {
      expect(api.getImageUrl({ imagenUrl: 'https://cdn.example.com/foto.jpg' })).toBe(
        'https://cdn.example.com/foto.jpg'
      );
    });

    it('devuelve null sin imagen para mostrar placeholder', () => {
      expect(api.getImageUrl({ imagenUrl: null })).toBeNull();
      expect(api.getImageUrl({ imagenUrl: '   ' })).toBeNull();
    });
  });

  describe('getPendientes', () => {
    it('returns pending sales with client token', async () => {
      const mockPendientes = [
        { idVenta: 100, fecha: '2024-01-15T10:30:00Z', total: 30000, medioPago: 'contado', estado: 'pagado' },
        { idVenta: 101, fecha: '2024-01-15T11:00:00Z', total: 15000, medioPago: 'tarjeta', estado: 'pendiente' },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockPendientes),
      });
      const result = await api.getPendientes('client-token');
      expect(result).toEqual(mockPendientes);
    });
  });
});