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
import { ShopApi } from './shop.api';

TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());

const COTIZAR_URL = `${API_URL}/logistica/fletes/cotizar`;

function producto(id: number, stock: number): Product {
  return { id, productId: id, sku: `RS-${id}`, name: 'Polera', category: 'Poleras', band: null, price: 14990, listPrice: null, size: 'M', color: 'Negro', printType: null, stock, image: '' };
}

describe('cotización del carrito', () => {
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

  it('la tienda envía las variantes y cantidades del carrito al cotizar', async () => {
    const api = TestBed.inject(ShopApi);
    const pet = api.quote(105, [{ idVariante: 7, cantidad: 2 }]);
    const req = httpMock.expectOne(COTIZAR_URL);
    expect(req.request.body).toEqual({ idComuna: 105, lineas: [{ idVariante: 7, cantidad: 2 }] });
    req.flush({ idComuna: 105, valor: 3990 });
    expect(await pet).toEqual({ idComuna: 105, valor: 3990 });
  });

  it('CartService cotiza con las líneas del carrito y actualiza el valor mostrado', async () => {
    const cart = TestBed.inject(CartService);
    cart.add(producto(7, 2));
    cart.setShipping({ comunaId: 105 });

    const pet = cart.quote();
    const req = httpMock.expectOne(COTIZAR_URL);
    expect(req.request.body).toEqual({ idComuna: 105, lineas: [{ idVariante: 7, cantidad: 1 }] });
    expect(cart.shippingCost()).toBeNull();
    req.flush({ idComuna: 105, valor: 3990 });
    await pet;
    expect(cart.shippingCost()).toBe(3990);
  });

  it('vuelve a cotizar con las nuevas cantidades cuando cambia el carrito', () => {
    const cart = TestBed.inject(CartService);
    cart.add(producto(7, 2));
    cart.setShipping({ comunaId: 105 });

    cart.changeQty(7, 1);
    const req = httpMock.expectOne(COTIZAR_URL);
    expect(req.request.body).toEqual({ idComuna: 105, lineas: [{ idVariante: 7, cantidad: 2 }] });
    req.flush({ idComuna: 105, valor: 4490 });
  });

  it('sin comuna, no envía petición ni valor', async () => {
    const cart = TestBed.inject(CartService);
    cart.add(producto(7, 2));
    await cart.quote();
    expect(cart.shippingCost()).toBeNull();
  });
});
