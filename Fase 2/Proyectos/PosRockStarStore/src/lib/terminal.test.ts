import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CobroMaquina,
  ErrorMaquina,
  MaquinaDeCobro,
  esperarResultado,
  guardarConfigMaquina,
  leerConfigMaquina,
  maquinaDeConfig,
  maquinaEnLaCaja,
  maquinaHttp,
  maquinaMercadoPago,
  partesTerminal,
  pagoParaVenta,
  tipoTarjeta,
  ultimosDigitos,
  urlBase,
} from './terminal';

const cobro = (datos: Partial<CobroMaquina> = {}): CobroMaquina => ({
  id: 'c1',
  monto: 15990,
  tipo: 'DEBITO',
  referencia: 'clave-1',
  estado: 'PENDIENTE',
  codigoAutorizacion: null,
  tarjeta: null,
  motivo: null,
  ...datos,
});

const respuesta = (status: number, cuerpo: unknown) =>
  ({ ok: status < 400, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) }) as Response;

describe('urlBase', () => {
  it('agrega http y quita la barra final', () => {
    expect(urlBase('192.168.1.50:8090')).toBe('http://192.168.1.50:8090');
    expect(urlBase(' http://maquina.local:8090/ ')).toBe('http://maquina.local:8090');
    expect(urlBase('https://pos.tienda.cl')).toBe('https://pos.tienda.cl');
  });
});

describe('tipoTarjeta', () => {
  it('solo las tarjetas pasan por la maquina', () => {
    expect(tipoTarjeta('DEBITO_PRESENCIAL')).toBe('DEBITO');
    expect(tipoTarjeta('CREDITO_PRESENCIAL')).toBe('CREDITO');
    expect(tipoTarjeta('EFECTIVO')).toBeNull();
  });
});

describe('pago para la venta', () => {
  it('guarda solo los ultimos cuatro digitos de la tarjeta', () => {
    expect(ultimosDigitos('•••• 4242')).toBe('4242');
    expect(ultimosDigitos('**** **** **** 0007 ')).toBe('0007');
    expect(ultimosDigitos(null)).toBeNull();
    expect(ultimosDigitos('sin datos')).toBeNull();
  });

  it('arma el pago con el cobro, la autorizacion y los ultimos digitos', () => {
    expect(pagoParaVenta(cobro({ estado: 'APROBADO', codigoAutorizacion: '123456', tarjeta: '•••• 4242' }))).toEqual({
      idCobro: 'c1',
      codigoAutorizacion: '123456',
      ultimosDigitos: '4242',
    });
  });
});

describe('configuracion', () => {
  beforeEach(() => localStorage.clear());

  it('parte desactivada, en modo prueba, y recuerda lo guardado', () => {
    expect(leerConfigMaquina()).toEqual({ activa: false, modo: 'prueba', direccion: 'localhost:8090', terminal: '' });
    const mercadoPago = { activa: true, modo: 'mercadopago' as const, direccion: '192.168.1.50:8090', terminal: 'NEWLAND_N950__SBX0000001' };
    guardarConfigMaquina(mercadoPago);
    expect(leerConfigMaquina()).toEqual(mercadoPago);
  });

  it('una configuracion de antes de los modos queda como maquina de prueba', () => {
    localStorage.setItem('pos_maquina_cobro', JSON.stringify({ activa: true, direccion: '192.168.1.50:8090' }));
    expect(leerConfigMaquina()).toEqual({ activa: true, modo: 'prueba', direccion: '192.168.1.50:8090', terminal: '' });
  });

  it('ignora una configuracion danada', () => {
    localStorage.setItem('pos_maquina_cobro', '{no es json');
    expect(leerConfigMaquina().activa).toBe(false);
  });
});

describe('maquinaHttp', () => {
  it('envia el cobro con monto, tipo y referencia', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(201, cobro()));
    const maquina = maquinaHttp('192.168.1.50:8090', fetchMock);
    await expect(maquina.cobrar(15990, 'DEBITO', 'clave-1')).resolves.toMatchObject({ estado: 'PENDIENTE' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://192.168.1.50:8090/api/cobros');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ monto: 15990, tipo: 'DEBITO', referencia: 'clave-1' });
  });

  it('un corte de red es SIN_CONEXION con la direccion en el mensaje', async () => {
    const maquina = maquinaHttp('10.0.0.9:8090', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = await maquina.info().catch((e) => e);
    expect(error).toBeInstanceOf(ErrorMaquina);
    expect(error.codigo).toBe('SIN_CONEXION');
    expect(error.message).toContain('http://10.0.0.9:8090');
  });

  it('propaga el codigo de la maquina, por ejemplo OCUPADA', async () => {
    const maquina = maquinaHttp('m:1', vi.fn().mockResolvedValue(respuesta(409, { codigo: 'OCUPADA', mensaje: 'Otro cobro en curso.' })));
    await expect(maquina.cobrar(1, 'CREDITO', 'k')).rejects.toMatchObject({ codigo: 'OCUPADA', message: 'Otro cobro en curso.' });
  });

  it('cancelar un cobro que ya se pago devuelve el cobro aprobado', async () => {
    const aprobado = cobro({ estado: 'APROBADO', codigoAutorizacion: '123456' });
    const maquina = maquinaHttp('m:1', vi.fn().mockResolvedValue(respuesta(409, { codigo: 'ESTADO_INVALIDO', mensaje: 'Ya aprobado', detalle: aprobado })));
    await expect(maquina.cancelar('c1')).resolves.toEqual(aprobado);
  });
});

describe('simulacion del pago', () => {
  it('la maquina de prueba en la red recibe la misma orden que sus botones de aprobar y rechazar', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(200, cobro({ estado: 'APROBADO' })));
    const maquina = maquinaHttp('192.168.1.50:8090', fetchMock);
    await maquina.simular!('c1', 'APROBAR');
    await maquina.simular!('c1', 'RECHAZAR');
    expect(fetchMock.mock.calls[0][0]).toBe('http://192.168.1.50:8090/api/cobros/c1/aprobar');
    expect(fetchMock.mock.calls[1][0]).toBe('http://192.168.1.50:8090/api/cobros/c1/rechazar');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ codigo: 'insufficient_amount' });
  });

  it('la maquina de la caja aprueba con codigo de autorizacion y ultimos digitos validos para la venta', async () => {
    const maquina = maquinaEnLaCaja();
    const pendiente = await maquina.cobrar(15990, 'DEBITO', 'clave-1');
    expect(pendiente.estado).toBe('PENDIENTE');
    await maquina.simular!(pendiente.id, 'APROBAR');
    const aprobado = await esperarResultado(maquina, pendiente.id, { intervaloMs: 1 });
    expect(aprobado.estado).toBe('APROBADO');
    const pago = pagoParaVenta(aprobado);
    // Las mismas reglas con que el backend valida el pago de la maquina.
    expect(pago.idCobro).toMatch(/^[\w-]{1,100}$/);
    expect(pago.codigoAutorizacion).toMatch(/^[A-Za-z0-9]{1,32}$/);
    expect(pago.ultimosDigitos).toMatch(/^\d{4}$/);
  });

  it('la maquina de la caja rechaza, cancela y no acepta dos cobros a la vez', async () => {
    const maquina = maquinaEnLaCaja();
    const primero = await maquina.cobrar(1000, 'CREDITO', 'a');
    await expect(maquina.cobrar(2000, 'DEBITO', 'b')).rejects.toMatchObject({ codigo: 'OCUPADA' });
    await maquina.simular!(primero.id, 'RECHAZAR');
    expect(await maquina.consultar(primero.id)).toMatchObject({ estado: 'RECHAZADO', codigo: 'insufficient_amount' });
    await expect(maquina.simular!(primero.id, 'APROBAR')).rejects.toMatchObject({ codigo: 'ESTADO_INVALIDO' });
    const segundo = await maquina.cobrar(2000, 'DEBITO', 'b');
    expect((await maquina.cancelar(segundo.id)).estado).toBe('CANCELADO');
  });

  it('cancelar un cobro que ya se pago responde el cobro aprobado, como la maquina real', async () => {
    const maquina = maquinaEnLaCaja();
    const c = await maquina.cobrar(1000, 'DEBITO', 'a');
    await maquina.simular!(c.id, 'APROBAR');
    expect((await maquina.cancelar(c.id)).estado).toBe('APROBADO');
    expect((await maquina.anular(c.id)).estado).toBe('ANULADO');
  });

  it('el modo caja usa la misma maquina en todas las ventas y una real no tiene simulacion', () => {
    const config = { activa: true, modo: 'caja' as const, direccion: 'localhost:8090', terminal: '' };
    expect(maquinaDeConfig(config, 't')).toBe(maquinaDeConfig(config, 't'));
    expect(maquinaMercadoPago('t', 'X').simular).toBeUndefined();
  });

  it('recuerda el modo caja', () => {
    guardarConfigMaquina({ activa: true, modo: 'caja', direccion: 'localhost:8090', terminal: '' });
    expect(leerConfigMaquina().modo).toBe('caja');
  });
});

describe('esperarResultado', () => {
  const maquinaCon = (consultar: MaquinaDeCobro['consultar']) => ({ consultar }) as MaquinaDeCobro;

  it('consulta hasta que el cobro deja de estar pendiente', async () => {
    const consultar = vi
      .fn()
      .mockResolvedValueOnce(cobro())
      .mockResolvedValueOnce(cobro())
      .mockResolvedValueOnce(cobro({ estado: 'APROBADO' }));
    await expect(esperarResultado(maquinaCon(consultar), 'c1', { intervaloMs: 1 })).resolves.toMatchObject({ estado: 'APROBADO' });
    expect(consultar).toHaveBeenCalledTimes(3);
  });

  it('tolera cortes de red pasajeros', async () => {
    const sinRed = new ErrorMaquina('sin red', 'SIN_CONEXION');
    const consultar = vi.fn().mockRejectedValueOnce(sinRed).mockRejectedValueOnce(sinRed).mockResolvedValueOnce(cobro({ estado: 'RECHAZADO' }));
    await expect(esperarResultado(maquinaCon(consultar), 'c1', { intervaloMs: 1 })).resolves.toMatchObject({ estado: 'RECHAZADO' });
  });

  it('se rinde si la maquina no vuelve', async () => {
    const consultar = vi.fn().mockRejectedValue(new ErrorMaquina('sin red', 'SIN_CONEXION'));
    await expect(esperarResultado(maquinaCon(consultar), 'c1', { intervaloMs: 1 })).rejects.toMatchObject({ codigo: 'SIN_CONEXION' });
    expect(consultar).toHaveBeenCalledTimes(6);
  });

  it('deja de esperar al abortar', async () => {
    const control = new AbortController();
    const consultar = vi.fn().mockImplementation(async () => {
      control.abort();
      return cobro();
    });
    await expect(esperarResultado(maquinaCon(consultar), 'c1', { intervaloMs: 1, senal: control.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('maquinaMercadoPago', () => {
  const TERMINAL = 'NEWLAND_N950__N950NCB123456789';
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('separa el modelo y la serie de la maquina', () => {
    expect(partesTerminal(TERMINAL)).toEqual({ modelo: 'NEWLAND N950', serie: 'N950NCB123456789' });
  });

  it('cobra a traves de la API con la sesion del vendedor y consulta cada 2 segundos', async () => {
    fetchMock.mockResolvedValue(respuesta(201, cobro({ id: 'ORD01' })));
    const maquina = maquinaMercadoPago('token-vendedor', TERMINAL);

    await maquina.cobrar(15990, 'CREDITO', 'clave-1');

    const [url, opciones] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/pagos\/point\/cobros$/);
    expect(opciones.headers.Authorization).toBe('Bearer token-vendedor');
    expect(JSON.parse(opciones.body)).toEqual({ terminal: TERMINAL, monto: 15990, tipo: 'CREDITO', referencia: 'clave-1' });
    expect(maquina.intervaloMs).toBe(2000);
  });

  it('la prueba de conexion exige que la maquina este en modo PDV', async () => {
    fetchMock.mockResolvedValue(respuesta(200, [{ id: TERMINAL, modo: 'STANDALONE' }]));
    await expect(maquinaMercadoPago('t', TERMINAL).info()).rejects.toMatchObject({ codigo: 'NO_PDV' });

    fetchMock.mockResolvedValue(respuesta(200, [{ id: TERMINAL, modo: 'PDV' }]));
    await expect(maquinaMercadoPago('t', TERMINAL).info()).resolves.toEqual({ nombre: 'Mercado Pago Point', modelo: 'NEWLAND N950', serie: 'N950NCB123456789' });
  });

  it('entrega los errores de la API como errores de la maquina, con su codigo', async () => {
    fetchMock.mockResolvedValue(respuesta(503, { codigo: 'MERCADOPAGO_NO_CONFIGURADO', mensaje: 'Falta la cuenta.' }));
    await expect(maquinaMercadoPago('t', TERMINAL).consultar('ORD01')).rejects.toMatchObject({ codigo: 'MERCADOPAGO_NO_CONFIGURADO', message: 'Falta la cuenta.' });

    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(maquinaMercadoPago('t', TERMINAL).consultar('ORD01')).rejects.toMatchObject({ codigo: 'SIN_CONEXION' });
  });
});
