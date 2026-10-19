import { useState } from 'react';
import { IonButton, IonIcon, IonInput, IonItem, IonSpinner } from '@ionic/react';
import { serverOutline } from 'ionicons/icons';

import { salud } from '../lib/api';
import { elegirServidor, normalizarServidor, servidorActual, servidorElegido } from '../lib/servidor';

/**
 * Servidor al que se conecta la app instalada. El APK trae la IP del equipo donde se
 * compiló; si ese equipo cambia de dirección en la red, aquí se escribe la nueva.
 */
const ServidorApp: React.FC = () => {
  const [actual, setActual] = useState(servidorActual());
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(servidorElegido() || actual);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [probando, setProbando] = useState(false);

  const probar = async () => {
    setProbando(true);
    try {
      const ok = await salud().catch(() => false);
      setAviso(
        ok
          ? { ok: true, texto: 'Conectado al servidor.' }
          : { ok: false, texto: 'El servidor no responde. Revise que el teléfono esté en la misma red Wi-Fi que el equipo.' },
      );
    } finally {
      setProbando(false);
    }
  };

  const guardar = async (direccion: string) => {
    elegirServidor(direccion);
    setActual(servidorActual());
    setEditando(false);
    await probar();
  };

  const confirmar = async () => {
    const direccion = normalizarServidor(texto);
    if (!direccion) {
      setAviso({ ok: false, texto: 'Escriba una dirección como 192.168.1.20:3000.' });
      return;
    }
    await guardar(direccion);
  };

  return (
    <div className="servidor-app" data-testid="servidor-app">
      <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 6px', fontSize: 13 }}>
        <IonIcon icon={serverOutline} aria-hidden="true" />
        <span>
          Servidor: <strong>{actual}</strong>
        </span>
      </p>
      {editando ? (
        <>
          <IonItem>
            <IonInput
              label="Dirección del servidor"
              labelPlacement="stacked"
              value={texto}
              placeholder="192.168.1.20:3000"
              inputmode="url"
              onIonInput={(e) => setTexto(e.detail.value ?? '')}
            />
          </IonItem>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <IonButton size="small" onClick={confirmar} disabled={probando}>
              Guardar
            </IonButton>
            <IonButton size="small" fill="clear" onClick={() => guardar('')} disabled={probando}>
              Usar la del APK
            </IonButton>
            <IonButton size="small" fill="clear" color="medium" onClick={() => setEditando(false)}>
              Cancelar
            </IonButton>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 4 }}>
          <IonButton size="small" fill="outline" onClick={() => setEditando(true)}>
            Cambiar
          </IonButton>
          <IonButton size="small" fill="clear" onClick={probar} disabled={probando}>
            {probando ? <IonSpinner name="crescent" /> : 'Probar conexión'}
          </IonButton>
        </div>
      )}
      {aviso && (
        <p className={`field-feedback ${aviso.ok ? 'valid' : 'invalid'}`} role={aviso.ok ? 'status' : 'alert'}>
          {aviso.texto}
        </p>
      )}
    </div>
  );
};

export default ServidorApp;
