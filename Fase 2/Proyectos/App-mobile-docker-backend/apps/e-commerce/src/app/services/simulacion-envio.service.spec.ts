// @vitest-environment jsdom
import 'zone.js';
import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { API_URL } from '../core/api';
import { CartService } from './cart.service';
import { type Product } from '../data/models';
import { SimulacionEnvioService } from './simulacion-envio.service';

TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());

const COTIZAR_URL = `${API_URL}/logistica/fletes/cotizar`;
const COMUNAS_URL = `${API_URL}/logistica/comunas?region=7`;

function producto(id: number, stock: number): Product {
  return { id, productId: id, sku: `RS-${id}`, name: 'Polera', category: 'Poleras', band: null, price: 14990, listPrice: null, size: 'M', color: 'Negro', printType: null, stock, image: '' };
}

describe('simulación del envío del carrito', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('vuelve a cotizar al cambiar la comuna y actualiza el costo mostrado', async () => {
    const svc = TestBed.inject(SimulacionEnvioService);
    TestBed.inject(CartService).add(producto(7, 2));

    const pet = svc.cambiarComuna(105);
    const req = httpMock.expectOne(COTIZAR_URL);
    expect(req.request.body).toEqual({ idComuna: 105, lineas: [{ idVariante: 7, cantidad: 1 }] });
    req.flush({ idComuna: 105, valor: 3990 });
    await pet;
    expect(svc.costo()).toBe(3990);
    expect(svc.comuna()).toBe(105);
  });

  it('al cambiar de comuna, cotiza de nuevo con las líneas del carrito', async () => {
    const svc = TestBed.inject(SimulacionEnvioService);
    const cart = TestBed.inject(CartService);
    cart.add(producto(7, 2));

    const primera = svc.cambiarComuna(105);
    httpMock.expectOne(COTIZAR_URL).flush({ idComuna: 105, valor: 3990 });
    await primera;

    const segunda = svc.cambiarComuna(99);
    const req = httpMock.expectOne(COTIZAR_URL);
    expect(req.request.body).toEqual({ idComuna: 99, lineas: [{ idVariante: 7, cantidad: 1 }] });
    req.flush({ idComuna: 99, valor: 2990 });
    await segunda;
    expect(svc.costo()).toBe(2990);
  });

  it('informa que no hay cobertura y permite reintentar', async () => {
    const svc = TestBed.inject(SimulacionEnvioService);

    const pet = svc.cambiarComuna(105);
    httpMock.expectOne(COTIZAR_URL).flush({ codigo: 'SIN_COBERTURA', mensaje: 'Starken no tiene cobertura para ese destino.' }, { status: 400, statusText: 'Bad Request' });
    await pet;

    expect(svc.sinCobertura()).toBe(true);
    expect(svc.costo()).toBeNull();
    expect(svc.error()).toBeNull();

    const retry = svc.reintentar();
    const req = httpMock.expectOne(COTIZAR_URL);
    expect(req.request.body).toEqual({ idComuna: 105, lineas: [] });
    req.flush({ idComuna: 105, valor: 3990 });
    await retry;
    expect(svc.sinCobertura()).toBe(false);
    expect(svc.costo()).toBe(3990);
  });

  it('muestra el error del transportista con el botón de reintento', async () => {
    const svc = TestBed.inject(SimulacionEnvioService);

    const pet = svc.cambiarComuna(105);
    httpMock.expectOne(COTIZAR_URL).flush({ codigo: 'DESPACHO_NO_DISPONIBLE', mensaje: 'Ocurrió un error inesperado.' }, { status: 503, statusText: 'Service Unavailable' });
    await pet;

    expect(svc.sinCobertura()).toBe(false);
    expect(svc.error()).toBeTruthy();
  });

  it('con carrito vacío no habilita usar el destino ni pide cotización', async () => {
    const svc = TestBed.inject(SimulacionEnvioService);
    const cart = TestBed.inject(CartService);

    const pet = svc.cambiarRegion(7);
    httpMock.expectOne(COMUNAS_URL).flush([{ idComuna: 105, nombre: 'Providencia' }]);
    await pet;

    expect(svc.comunas()).toEqual([{ idComuna: 105, nombre: 'Providencia' }]);
    expect(svc.puedeUsar()).toBe(false);
    const antes = cart.shipping();
    svc.usarDestino();
    expect(cart.shipping()).toEqual(antes);
    expect(cart.pending()).toBeNull();
  });

  it('"Usar este destino" copia la comuna a los datos de despacho sin tocar el resto ni crear compra', async () => {
    const svc = TestBed.inject(SimulacionEnvioService);
    const cart = TestBed.inject(CartService);
    cart.add(producto(7, 2));
    cart.setShipping({ recipient: 'Ana Rock', phone: '+56912345678', regionId: null, comunaId: 99, address: 'Calle 1' });

    const primera = svc.cambiarRegion(7);
    httpMock.expectOne(COMUNAS_URL).flush([{ idComuna: 105, nombre: 'Providencia' }]);
    await primera;

    const segunda = svc.cambiarComuna(105);
    httpMock.expectOne(COTIZAR_URL).flush({ idComuna: 105, valor: 3990 });
    await segunda;
    expect(svc.costo()).toBe(3990);

    const antes = cart.items().map((item) => [item.id, item.qty]);
    svc.usarDestino();
    const req = httpMock.expectOne(COTIZAR_URL);
    expect(req.request.body).toEqual({ idComuna: 105, lineas: [{ idVariante: 7, cantidad: 1 }] });
    req.flush({ idComuna: 105, valor: 3990 });

    expect(cart.shipping().comunaId).toBe(105);
    expect(cart.shipping().regionId).toBe(7);
    expect(cart.shipping().recipient).toBe('Ana Rock');
    expect(cart.shipping().phone).toBe('+56912345678');
    expect(cart.items().map((item) => [item.id, item.qty])).toEqual(antes);
    expect(cart.pending()).toBeNull();
  });
});
