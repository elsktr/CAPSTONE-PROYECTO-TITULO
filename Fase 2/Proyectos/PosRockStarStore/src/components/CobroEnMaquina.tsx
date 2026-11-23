import { IonButton, IonContent, IonHeader, IonIcon, IonModal, IonSpinner, IonTitle, IonToolbar } from '@ionic/react';
import { useEffect, useRef, useState } from 'react';
import { alertCircleOutline, cardOutline, closeCircleOutline } from 'ionicons/icons';
import { CobroMaquina, ErrorMaquina, MaquinaDeCobro, TipoTarjeta, esperarResultado } from '../lib/terminal';
import { formatCLP } from '../utils/format';

/** Titulo del resultado de un cobro que no se aprobo. */
const TITULOS: Partial<Record<CobroMaquina['estado'], string>> = {
  RECHAZADO: 'Pago rechazado',
  CANCELADO: 'Cobro cancelado',
  REVISAR: 'Revisa la máquina',
};

type Paso =
  | { tipo: 'enviando' }
  | { tipo: 'esperando' }
  | { tipo: 'cancelando' }
  | { tipo: 'rechazado'; cobro: CobroMaquina }
  | { tipo: 'error'; mensaje: string };

interface Props {
  isOpen: boolean;
  maquina: MaquinaDeCobro;
  monto: number;
  tarjeta: TipoTarjeta;
  /** Clave de la venta: la maquina la guarda junto al cobro. */
  referencia: string;
  onAprobado: (cobro: CobroMaquina) => void;
  /** Se desistio del cobro (cancelado, o para elegir otro medio de pago). */
  onCerrar: () => void;
  /** La maquina no responde: el vendedor cobra aparte y registra la venta igual. */
  onSinMaquina: () => void;
}

/** Envia el monto a la maquina de cobro y espera a que el cliente pague. */
export const CobroEnMaquina: React.FC<Props> = ({ isOpen, maquina, monto, tarjeta, referencia, onAprobado, onCerrar, onSinMaquina }) => {
  const [paso, setPaso] = useState<Paso>({ tipo: 'enviando' });
  const cobroActual = useRef<CobroMaquina | null>(null);
  const espera = useRef<AbortController | null>(null);
  const desistido = useRef(false);

  const detenerEspera = () => {
    espera.current?.abort();
    espera.current = null;
  };

  const iniciar = async () => {
    detenerEspera();
    desistido.current = false;
    cobroActual.current = null;
    setPaso({ tipo: 'enviando' });
    let cobro: CobroMaquina;
    try {
      cobro = await maquina.cobrar(monto, tarjeta, referencia);
    } catch (error) {
      if (!desistido.current) {
        setPaso({ tipo: 'error', mensaje: error instanceof Error ? error.message : 'La máquina de cobro no respondió.' });
      }
      return;
    }
    cobroActual.current = cobro;
    // Se cancelo mientras el monto viajaba: la maquina no debe quedar esperando.
    if (desistido.current) {
      await maquina.cancelar(cobro.id).catch(() => undefined);
      return;
    }
    await iniciarEspera(cobro);
  };

  const cancelar = async () => {
    desistido.current = true;
    detenerEspera();
    const cobro = cobroActual.current;
    if (!cobro) return onCerrar();
    setPaso({ tipo: 'cancelando' });
    try {
      const final = await maquina.cancelar(cobro.id);
      // El cliente alcanzo a pagar: la venta sigue como aprobada.
      if (final.estado === 'APROBADO') return onAprobado(final);
      onCerrar();
    } catch (error) {
      setPaso({
        tipo: 'error',
        mensaje:
          error instanceof ErrorMaquina && error.codigo === 'SIN_CONEXION'
            ? 'No se pudo cancelar en la máquina: cancélalo directamente en ella antes de cobrar de nuevo.'
            : error instanceof Error ? error.message : 'No se pudo cancelar el cobro.',
      });
    }
  };

  /**
   * La maquina no informo el resultado: antes de cobrar de nuevo se pregunta otra vez, para
   * no cobrarle dos veces al cliente si el pago si se aprobo.
   */
  const consultarDeNuevo = async (cobro: CobroMaquina) => {
    try {
      const actual = await maquina.consultar(cobro.id);
      if (actual.estado === 'APROBADO') onAprobado(actual);
      else if (actual.estado === 'PENDIENTE') void iniciarEspera(actual);
      else setPaso({ tipo: 'rechazado', cobro: actual });
    } catch (error) {
      setPaso({ tipo: 'error', mensaje: error instanceof Error ? error.message : 'La máquina de cobro no respondió.' });
    }
  };

  /** Vuelve a esperar un cobro que sigue pendiente en la maquina. */
  const iniciarEspera = async (cobro: CobroMaquina) => {
    detenerEspera();
    const control = new AbortController();
    espera.current = control;
    cobroActual.current = cobro;
    setPaso({ tipo: 'esperando' });
    try {
      const resultado = await esperarResultado(maquina, cobro.id, { senal: control.signal });
      if (resultado.estado === 'APROBADO') onAprobado(resultado);
      else setPaso({ tipo: 'rechazado', cobro: resultado });
    } catch (error) {
      if (control.signal.aborted) return;
      setPaso({ tipo: 'error', mensaje: error instanceof Error ? error.message : 'La máquina de cobro no respondió.' });
    }
  };

  useEffect(() => () => detenerEspera(), []);

  const esperandoPago = paso.tipo === 'enviando' || paso.tipo === 'esperando' || paso.tipo === 'cancelando';
  const nombreTarjeta = tarjeta === 'CREDITO' ? 'crédito' : 'débito';

  return (
    <IonModal
      isOpen={isOpen}
      onDidPresent={() => void iniciar()}
      onWillDismiss={detenerEspera}
      backdropDismiss={false}
      className="pos-modal-centered maquina-modal"
      aria-label="Cobro en la máquina"
    >
      <IonHeader>
        <IonToolbar color="dark">
          <IonTitle>Cobro en la máquina</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="maquina-cobro">
          <div className="maquina-monto">{formatCLP(monto)}</div>
          <div className="maquina-tipo">Tarjeta de {nombreTarjeta}</div>

          {esperandoPago && (
            <div className="maquina-estado" role="status">
              <IonSpinner name="crescent" />
              <strong>
                {paso.tipo === 'enviando' && 'Enviando el monto a la máquina…'}
                {paso.tipo === 'esperando' && 'Esperando el pago en la máquina'}
                {paso.tipo === 'cancelando' && 'Cancelando el cobro…'}
              </strong>
              {paso.tipo === 'esperando' && <span>Pide al cliente acercar, insertar o deslizar su tarjeta.</span>}
            </div>
          )}

          {paso.tipo === 'rechazado' && (
            <div className="maquina-estado maquina-falla" role="alert">
              <IonIcon icon={closeCircleOutline} />
              <strong>{TITULOS[paso.cobro.estado] ?? 'Cobro no realizado'}</strong>
              {paso.cobro.motivo && <span>{paso.cobro.motivo}</span>}
              {paso.cobro.codigo && <span className="maquina-codigo">Código Mercado Pago: {paso.cobro.codigo}</span>}
            </div>
          )}

          {paso.tipo === 'error' && (
            <div className="maquina-estado maquina-falla" role="alert">
              <IonIcon icon={alertCircleOutline} />
              <strong>Problema con la máquina</strong>
              <span>{paso.mensaje}</span>
            </div>
          )}
        </div>

        {esperandoPago ? (
          <IonButton expand="block" fill="outline" color="medium" onClick={() => void cancelar()} disabled={paso.tipo === 'cancelando'}>
            Cancelar cobro
          </IonButton>
        ) : (
          <>
            {paso.tipo === 'rechazado' && paso.cobro.estado === 'REVISAR' && (
              <IonButton expand="block" onClick={() => void consultarDeNuevo(paso.cobro)}>
                Consultar el resultado
              </IonButton>
            )}
            <IonButton
              expand="block"
              fill={paso.tipo === 'rechazado' && paso.cobro.estado === 'REVISAR' ? 'outline' : 'solid'}
              onClick={() => void iniciar()}
            >
              <IonIcon icon={cardOutline} slot="start" />
              Reintentar en la máquina
            </IonButton>
            {paso.tipo === 'error' && (
              <IonButton expand="block" fill="outline" onClick={onSinMaquina}>
                Ya cobré aparte: registrar la venta
              </IonButton>
            )}
            <IonButton expand="block" fill="clear" color="medium" onClick={onCerrar}>
              Cambiar medio de pago
            </IonButton>
          </>
        )}
      </IonContent>
    </IonModal>
  );
};
