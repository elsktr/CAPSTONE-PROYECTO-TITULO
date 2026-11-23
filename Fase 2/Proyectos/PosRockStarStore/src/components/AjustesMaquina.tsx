import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonModal,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/react';
import { useState } from 'react';
import { checkmarkCircleOutline, closeCircleOutline, alertCircleOutline } from 'ionicons/icons';
import { TerminalPoint, activarTerminalPoint, getTerminalesPoint } from '../lib/api';
import { ConfigMaquina, InfoMaquina, ModoMaquina, maquinaDeConfig, partesTerminal, urlBase } from '../lib/terminal';

interface Props {
  isOpen: boolean;
  config: ConfigMaquina;
  /** Sesion del vendedor: la maquina Mercado Pago se usa a traves de la API. */
  accessToken: string;
  onGuardar: (config: ConfigMaquina) => void;
  onClose: () => void;
}

type Prueba = { estado: 'probando' } | { estado: 'ok'; info: InfoMaquina } | { estado: 'error'; mensaje: string } | null;
type Terminales = { estado: 'buscando' } | { estado: 'listas'; terminales: TerminalPoint[] } | { estado: 'error'; mensaje: string } | null;

const mensajeDe = (error: unknown, otro: string) => (error instanceof Error ? error.message : otro);

/**
 * Activa la maquina de cobro de esta caja: la de prueba, que simula una maquina Mercado Pago
 * en la red, o una Mercado Pago Point real, que se activa en modo PDV y se prueba aqui.
 */
export const AjustesMaquina: React.FC<Props> = ({ isOpen, config, accessToken, onGuardar, onClose }) => {
  const [activa, setActiva] = useState(config.activa);
  const [modo, setModo] = useState<ModoMaquina>(config.modo);
  const [direccion, setDireccion] = useState(config.direccion);
  const [terminal, setTerminal] = useState(config.terminal);
  const [terminales, setTerminales] = useState<Terminales>(null);
  const [activando, setActivando] = useState<string | null>(null);
  const [prueba, setPrueba] = useState<Prueba>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const borrador = (): ConfigMaquina => ({ activa, modo, direccion: direccion.trim() || config.direccion, terminal });

  const probar = async () => {
    setPrueba({ estado: 'probando' });
    try {
      setPrueba({ estado: 'ok', info: await maquinaDeConfig(borrador(), accessToken).info() });
    } catch (error) {
      setPrueba({ estado: 'error', mensaje: mensajeDe(error, 'No responde.') });
    }
  };

  const buscarTerminales = async () => {
    setTerminales({ estado: 'buscando' });
    setPrueba(null);
    try {
      const lista = await getTerminalesPoint(accessToken);
      setTerminales({ estado: 'listas', terminales: lista });
      // Con una sola maquina en la cuenta, queda elegida.
      if (lista.length === 1 && !terminal) setTerminal(lista[0].id);
    } catch (error) {
      setTerminales({ estado: 'error', mensaje: mensajeDe(error, 'No se pudieron leer las máquinas.') });
    }
  };

  const activarPdv = async (id: string) => {
    setActivando(id);
    setPrueba(null);
    try {
      const activada = await activarTerminalPoint(accessToken, id);
      setTerminales((actual) =>
        actual?.estado === 'listas' ? { ...actual, terminales: actual.terminales.map((t) => (t.id === id ? activada : t)) } : actual,
      );
      setTerminal(id);
    } catch (error) {
      setTerminales({ estado: 'error', mensaje: mensajeDe(error, 'No se pudo activar la máquina.') });
    } finally {
      setActivando(null);
    }
  };

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    if (activa && modo === 'mercadopago' && !terminal) {
      setAviso('Elige la máquina Mercado Pago de esta caja.');
      return;
    }
    onGuardar(borrador());
  };

  return (
    <IonModal
      isOpen={isOpen}
      onWillPresent={() => {
        setActiva(config.activa);
        setModo(config.modo);
        setDireccion(config.direccion);
        setTerminal(config.terminal);
        setTerminales(null);
        setPrueba(null);
        setAviso(null);
      }}
      onDidDismiss={onClose}
      className="pos-modal-centered ajustes-maquina-modal"
      aria-label="Máquina de cobro"
    >
      <IonHeader>
        <IonToolbar color="dark">
          <IonTitle>Máquina de cobro</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} fill="clear" aria-label="Cerrar ajustes">
              <IonIcon icon={closeCircleOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <form onSubmit={guardar}>
          <IonItem lines="none" className="ajuste-fila">
            <IonLabel>
              <strong>Usar la máquina de cobro</strong>
              <p>Las ventas con débito o crédito se cobran enviando el monto a la máquina.</p>
            </IonLabel>
            <IonToggle
              slot="end"
              checked={activa}
              onIonChange={(e) => setActiva(e.detail.checked)}
              aria-label="Usar la máquina de cobro"
              className="maquina-toggle"
            />
          </IonItem>

          <IonSegment
            value={modo}
            onIonChange={(e) => {
              setModo(e.detail.value === 'mercadopago' ? 'mercadopago' : 'prueba');
              setPrueba(null);
              setAviso(null);
            }}
            className="maquina-modo"
            aria-label="Tipo de máquina"
          >
            <IonSegmentButton value="prueba">Prueba (simulada)</IonSegmentButton>
            <IonSegmentButton value="mercadopago">Mercado Pago Point</IonSegmentButton>
          </IonSegment>

          {modo === 'prueba' ? (
            <>
              <p className="ajuste-ayuda">
                Simula una máquina Mercado Pago. Desde su pantalla, en <code>{urlBase(direccion || config.direccion)}</code>, se aprueba el pago,
                se rechaza con cada código de Mercado Pago (fondos insuficientes, tarjeta bloqueada…), se cancela en la máquina o queda sin
                respuesta.
              </p>
              <label className="ajuste-campo">
                <span>Dirección en la red (IP y puerto)</span>
                <input
                  className="ajuste-input"
                  value={direccion}
                  onChange={(e) => {
                    setDireccion(e.target.value);
                    setPrueba(null);
                  }}
                  placeholder="192.168.1.50:8090"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="ayuda-direccion"
                />
              </label>
              <p id="ayuda-direccion" className="ajuste-ayuda">
                La máquina debe estar en la misma red que esta caja.
              </p>
            </>
          ) : (
            <>
              <p className="ajuste-ayuda">
                Una máquina Point de la cuenta de Mercado Pago de la tienda. Para recibir cobros desde la caja debe estar en modo PDV; después de
                activarla, reiníciala.
              </p>
              <IonButton expand="block" fill="outline" onClick={() => void buscarTerminales()} disabled={terminales?.estado === 'buscando'}>
                {terminales?.estado === 'buscando' ? <IonSpinner name="crescent" /> : 'Buscar máquinas de la cuenta'}
              </IonButton>
              {terminales?.estado === 'error' && (
                <p className="ajuste-prueba falla" role="alert">
                  <IonIcon icon={alertCircleOutline} /> {terminales.mensaje}
                </p>
              )}
              {terminales?.estado === 'listas' && terminales.terminales.length === 0 && (
                <p className="ajuste-ayuda" role="status">
                  La cuenta no tiene máquinas. Vincúlala desde la app de Mercado Pago escaneando el código de la máquina.
                </p>
              )}
              {terminales?.estado === 'listas' && terminales.terminales.length > 0 && (
                <div className="terminales" role="radiogroup" aria-label="Máquinas de la cuenta">
                  {terminales.terminales.map((t) => {
                    const { modelo, serie } = partesTerminal(t.id);
                    return (
                      <div key={t.id} className={`terminal${terminal === t.id ? ' elegida' : ''}`}>
                        <label>
                          <input
                            type="radio"
                            name="terminal"
                            checked={terminal === t.id}
                            onChange={() => {
                              setTerminal(t.id);
                              setPrueba(null);
                              setAviso(null);
                            }}
                          />
                          <span>
                            <strong>{modelo}</strong> · serie {serie}
                            <small className={t.modo === 'PDV' ? 'modo pdv' : 'modo'}>{t.modo === 'PDV' ? 'Modo PDV' : `Modo ${t.modo}`}</small>
                          </span>
                        </label>
                        {t.modo !== 'PDV' && (
                          <IonButton size="small" onClick={() => void activarPdv(t.id)} disabled={activando !== null}>
                            {activando === t.id ? <IonSpinner name="crescent" /> : 'Activar en modo PDV'}
                          </IonButton>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {terminal && terminales?.estado !== 'listas' && (
                <p className="ajuste-ayuda">
                  Máquina de esta caja: <code>{terminal}</code>
                </p>
              )}
            </>
          )}

          <IonButton expand="block" fill="outline" onClick={() => void probar()} disabled={prueba?.estado === 'probando'}>
            {prueba?.estado === 'probando' ? <IonSpinner name="crescent" /> : 'Probar conexión'}
          </IonButton>

          {prueba?.estado === 'ok' && (
            <p className="ajuste-prueba ok" role="status">
              <IonIcon icon={checkmarkCircleOutline} /> Conectada: {prueba.info.nombre} ({prueba.info.modelo}, serie {prueba.info.serie})
            </p>
          )}
          {prueba?.estado === 'error' && (
            <p className="ajuste-prueba falla" role="alert">
              <IonIcon icon={alertCircleOutline} /> {prueba.mensaje}
            </p>
          )}
          {aviso && (
            <p className="ajuste-prueba falla" role="alert">
              <IonIcon icon={alertCircleOutline} /> {aviso}
            </p>
          )}

          <IonButton expand="block" type="submit" className="mt-16">
            Guardar
          </IonButton>
        </form>
      </IonContent>
    </IonModal>
  );
};
