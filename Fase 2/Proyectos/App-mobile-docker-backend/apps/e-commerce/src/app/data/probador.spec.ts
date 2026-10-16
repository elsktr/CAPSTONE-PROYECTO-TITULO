import { describe, expect, it } from 'vitest';

import {
  MEDIDAS_EJEMPLO,
  colorDePrenda,
  estimarCuerpo,
  evaluarAjuste,
  medidasDeTalla,
  recomendarTalla,
  tablaDeTallas,
  tipoDePrenda,
  validarMedidas,
} from './probador';

describe('validarMedidas', () => {
  it('acepta medidas dentro de rango', () => {
    expect(validarMedidas({ altura: 175, peso: 78 })).toBeNull();
    expect(validarMedidas({ altura: 140, peso: 35 })).toBeNull();
    expect(validarMedidas({ altura: 210, peso: 180 })).toBeNull();
  });

  it('rechaza alturas y pesos fuera de rango o vacíos', () => {
    expect(validarMedidas({ altura: 139, peso: 70 })).toContain('altura');
    expect(validarMedidas({ altura: 211, peso: 70 })).toContain('altura');
    expect(validarMedidas({ altura: 170, peso: 34 })).toContain('peso');
    expect(validarMedidas({ altura: 170, peso: Number.NaN })).toContain('peso');
  });

  it('acepta pecho, cintura y cadera vacíos o en rango, y rechaza los fuera de rango', () => {
    expect(validarMedidas(MEDIDAS_EJEMPLO)).toBeNull();
    expect(validarMedidas({ altura: 175, peso: 78, pecho: null, cintura: undefined })).toBeNull();
    expect(validarMedidas({ altura: 175, peso: 78, pecho: 30 })).toContain('pecho');
    expect(validarMedidas({ altura: 175, peso: 78, cintura: 200 })).toContain('cintura');
    expect(validarMedidas({ altura: 175, peso: 78, cadera: Number.NaN })).toContain('cadera');
  });
});

describe('estimarCuerpo', () => {
  it('estima medidas plausibles para un cuerpo promedio', () => {
    const cuerpo = estimarCuerpo({ altura: 175, peso: 78 });
    expect(cuerpo.imc).toBeCloseTo(25.5, 1);
    expect(cuerpo.pecho).toBeGreaterThan(95);
    expect(cuerpo.pecho).toBeLessThan(104);
    expect(cuerpo.cintura).toBeGreaterThan(82);
    expect(cuerpo.cintura).toBeLessThan(92);
  });

  it('usa las medidas que da el cliente y estima solo las que faltan', () => {
    const cuerpo = estimarCuerpo(MEDIDAS_EJEMPLO);
    expect(cuerpo).toMatchObject({ altura: 175, pecho: 100, cintura: 86, cadera: 98, complexion: 'media' });
    const parcial = estimarCuerpo({ altura: 175, peso: 78, pecho: 108 });
    expect(parcial.pecho).toBe(108);
    expect(parcial.cintura).toBe(estimarCuerpo({ altura: 175, peso: 78 }).cintura);
  });

  it('la contextura agranda o achica los contornos estimados, no los dados', () => {
    const media = estimarCuerpo({ altura: 175, peso: 78 });
    const robusta = estimarCuerpo({ altura: 175, peso: 78, complexion: 'robusta' });
    const delgada = estimarCuerpo({ altura: 175, peso: 78, complexion: 'delgada' });
    expect(media.complexion).toBe('media');
    expect(robusta.pecho).toBeGreaterThan(media.pecho);
    expect(delgada.cintura).toBeLessThan(media.cintura);
    expect(estimarCuerpo({ altura: 175, peso: 78, pecho: 100, complexion: 'robusta' }).pecho).toBe(100);
  });

  it('en el cuerpo femenino estima menos cintura y más cadera, sin tocar los contornos dados', () => {
    const masculino = estimarCuerpo({ altura: 165, peso: 60 });
    const femenino = estimarCuerpo({ altura: 165, peso: 60, sexo: 'femenino' });
    expect(masculino.sexo).toBe('masculino');
    expect(femenino.cintura).toBeLessThan(masculino.cintura);
    expect(femenino.cadera).toBeGreaterThan(masculino.cadera);
    expect(femenino.pecho).toBe(masculino.pecho);
    expect(estimarCuerpo({ altura: 165, peso: 60, cintura: 80, sexo: 'femenino' }).cintura).toBe(80);
  });

  it('a igual altura, más peso da contornos mayores, y la cintura crece más que el pecho', () => {
    const delgado = estimarCuerpo({ altura: 175, peso: 60 });
    const grueso = estimarCuerpo({ altura: 175, peso: 100 });
    expect(grueso.pecho).toBeGreaterThan(delgado.pecho);
    expect(grueso.cintura / delgado.cintura).toBeGreaterThan(grueso.pecho / delgado.pecho);
  });
});

describe('tipoDePrenda', () => {
  it('reconoce las categorías de la tienda, con o sin tildes', () => {
    expect(tipoDePrenda('Poleras')).toBe('polera');
    expect(tipoDePrenda('Polerones')).toBe('poleron');
    expect(tipoDePrenda('Polerón')).toBe('poleron');
    expect(tipoDePrenda('Chaquetas')).toBe('chaqueta');
    expect(tipoDePrenda('Pantalones')).toBe('pantalon');
    expect(tipoDePrenda('Cinturones')).toBe('cinturon');
  });

  it('devuelve null para categorías sin tabla de medidas', () => {
    expect(tipoDePrenda('Accesorios')).toBeNull();
    expect(tipoDePrenda('Vinilos')).toBeNull();
  });
});

describe('tablaDeTallas', () => {
  it('ordena las tallas de menor a mayor sin huecos entre rangos', () => {
    for (const tipo of ['polera', 'pantalon'] as const) {
      const tabla = tablaDeTallas(tipo);
      for (let i = 1; i < tabla.length; i++) {
        expect(tabla[i]!.desde).toBe(tabla[i - 1]!.hasta);
      }
    }
  });

  it('da más holgura a un polerón que a una polera de la misma talla', () => {
    expect(medidasDeTalla('poleron', 'M')!.contornoPrenda).toBeGreaterThan(medidasDeTalla('polera', 'M')!.contornoPrenda);
  });

  it('encuentra la talla única aunque venga sin tilde o en mayúsculas', () => {
    expect(medidasDeTalla('cinturon', 'UNICA')?.talla).toBe('Única');
    expect(medidasDeTalla('polera', 'm')?.talla).toBe('M');
    expect(medidasDeTalla('polera', '42')).toBeNull();
  });
});

describe('evaluarAjuste', () => {
  const promedio = estimarCuerpo({ altura: 175, peso: 78 });

  it('la talla que contiene el contorno queda justa y de largo adecuado', () => {
    expect(evaluarAjuste(promedio, 'polera', 'M')).toMatchObject({ talla: 'M', ancho: 'justa', largo: 'adecuada' });
  });

  it('una talla menor queda apretada y una mucho mayor queda holgada', () => {
    expect(evaluarAjuste(promedio, 'polera', 'S')?.ancho).toBe('apretada');
    expect(evaluarAjuste(promedio, 'polera', 'XL')?.ancho).toBe('holgada');
  });

  it('la holgura es la diferencia entre la prenda y el cuerpo', () => {
    const ajuste = evaluarAjuste(promedio, 'polera', 'M')!;
    expect(ajuste.holgura).toBe(Math.round(medidasDeTalla('polera', 'M')!.contornoPrenda - promedio.pecho));
  });

  it('el largo depende de la altura', () => {
    const alto = estimarCuerpo({ altura: 195, peso: 85 });
    const bajo = estimarCuerpo({ altura: 152, peso: 50 });
    expect(evaluarAjuste(alto, 'polera', 'M')?.largo).toBe('corta');
    expect(evaluarAjuste(bajo, 'polera', 'M')?.largo).toBe('larga');
    expect(evaluarAjuste(alto, 'pantalon', '44')?.largo).toBe('corta');
    expect(evaluarAjuste(bajo, 'pantalon', '38')?.largo).toBe('larga');
  });

  it('el cinturón de talla única calza siempre en rango', () => {
    expect(evaluarAjuste(promedio, 'cinturon', 'Única')).toMatchObject({ ancho: 'justa', largo: 'adecuada' });
  });

  it('devuelve null para una talla que no existe en el tipo de prenda', () => {
    expect(evaluarAjuste(promedio, 'pantalon', 'M')).toBeNull();
  });
});

describe('recomendarTalla', () => {
  it('recomienda la talla cuyo rango contiene el contorno', () => {
    const promedio = estimarCuerpo({ altura: 175, peso: 78 });
    expect(recomendarTalla(promedio, 'polera')).toBe('M');
    expect(recomendarTalla(promedio, 'pantalon')).toBe('44');
    expect(recomendarTalla(promedio, 'cinturon')).toBe('Única');
  });

  it('fuera de la tabla recomienda la talla del extremo más cercano', () => {
    expect(recomendarTalla(estimarCuerpo({ altura: 150, peso: 38 }), 'polera')).toBe('XS');
    expect(recomendarTalla(estimarCuerpo({ altura: 200, peso: 175 }), 'polera')).toBe('XXL');
  });

  it('la talla recomendada siempre queda justa de ancho', () => {
    for (const peso of [50, 65, 80, 95, 110]) {
      const cuerpo = estimarCuerpo({ altura: 175, peso });
      const talla = recomendarTalla(cuerpo, 'polera');
      const ajuste = evaluarAjuste(cuerpo, 'polera', talla)!;
      const contorno = cuerpo.pecho;
      const dentroDeTabla = contorno >= 82 && contorno < 128;
      if (dentroDeTabla) expect(ajuste.ancho).toBe('justa');
    }
  });
});

describe('colorDePrenda', () => {
  it('traduce el nombre del color, aunque tenga matices', () => {
    expect(colorDePrenda('Negro')).toBe('#1c1c1f');
    expect(colorDePrenda('Azul oscuro')).toBe('#2c4a7a');
    expect(colorDePrenda('Café')).toBe('#5a3b26');
  });

  it('usa un gris oscuro para colores desconocidos', () => {
    expect(colorDePrenda('Tornasol')).toBe('#3a3a40');
  });
});
