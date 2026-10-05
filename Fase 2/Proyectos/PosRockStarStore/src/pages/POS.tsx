import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButtons,
  IonButton,
  IonIcon,
  IonBadge,
  IonGrid,
  IonRow,
  IonCol,
  IonCard,
  IonCardContent,
  IonItem,
  IonLabel,
  IonInput,
  IonSpinner,
  IonAlert,
  IonModal,
  IonList,
  IonText,
  IonSegment,
  IonSegmentButton,
  IonRadio,
  IonRadioGroup,
} from '@ionic/react';
import { useAuth } from '../contexts/AuthContext';
import { getCatalogo, ArticuloCatalogo, crearCheckout, retornoPago, CheckoutResponse, RetornoPagoResponse, VentaPendiente, getImageUrl } from '../lib/api';
import { useState, useEffect, useCallback } from 'react';
import { cartOutline, logOutOutline, refreshOutline, receiptOutline, addOutline, removeOutline, warningOutline, checkmarkCircleOutline, closeCircleOutline, cashOutline, cardOutline, printOutline, timeOutline, listOutline, homeOutline } from 'ionicons/icons';
import { formatCLP } from '../utils/format';
import { ProductImage } from '../components/ProductImage';
import { EmptyState, ErrorAlert, SkeletonGrid } from '../components/FeedbackStates';

const POS: React.FC = () => {
  const { vendedor, logout, cliente, setCliente } = useAuth();
  const [catalogo, setCatalogo] = useState<ArticuloCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const [carrito, setCarrito] = useState<Map<number, number>>(new Map());
  const [showBoleta, setShowBoleta] = useState(false);
  const [boletaData, setBoletaData] = useState<any>(null);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [clienteEmail, setClienteEmail] = useState('');
  const [clientePassword, setClientePassword] = useState('');
  const [clienteLoading, setClienteLoading] = useState(false);
  const [clienteError, setClienteError] = useState<string | null>(null);
  
  // Checkout flow states
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [showCheckoutError, setShowCheckoutError] = useState(false);
  const [medioPago, setMedioPago] = useState<'contado' | 'tarjeta'>('contado');
  const [showMedioPagoModal, setShowMedioPagoModal] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [checkoutResponse, setCheckoutResponse] = useState<CheckoutResponse | null>(null);
  
  // Jornada register
  const [showRegistro, setShowRegistro] = useState(false);
  const [registroVentas, setRegistroVentas] = useState<VentaPendiente[]>([]);
  const [registroLoading, setRegistroLoading] = useState(false);

  const generateIdempotencyKey = useCallback(() => {
    return crypto.randomUUID();
  }, []);

  useEffect(() => {
    cargarCatalogo();
    // Health-check del backend al abrir el POS (no bloquea la UI).
    import('../lib/api')
      .then((m) => m.salud())
      .catch(() => false);
  }, []);

  const cargarCatalogo = async () => {
    try {
      setLoading(true);
      const data = await getCatalogo();
      setCatalogo(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar catálogo');
      setShowError(true);
    } finally {
      setLoading(false);
    }
  };

  const agregarAlCarrito = (idVariante: number, disponible: number) => {
    const cantidadActual = carrito.get(idVariante) || 0;
    if (cantidadActual < disponible) {
      const nuevoCarrito = new Map(carrito);
      nuevoCarrito.set(idVariante, cantidadActual + 1);
      setCarrito(nuevoCarrito);
    }
  };

  const quitarDelCarrito = (idVariante: number) => {
    const cantidadActual = carrito.get(idVariante) || 0;
    if (cantidadActual > 1) {
      const nuevoCarrito = new Map(carrito);
      nuevoCarrito.set(idVariante, cantidadActual - 1);
      setCarrito(nuevoCarrito);
    } else if (cantidadActual === 1) {
      const nuevoCarrito = new Map(carrito);
      nuevoCarrito.delete(idVariante);
      setCarrito(nuevoCarrito);
    }
  };

  const getCantidad = (idVariante: number) => carrito.get(idVariante) || 0;
  const getDisponible = (idVariante: number) => {
    const item = catalogo.find(p => p.idVariante === idVariante);
    return item?.disponible || 0;
  };

  const total = Array.from(carrito.entries()).reduce((sum, [idVariante, cantidad]) => {
    const item = catalogo.find(p => p.idVariante === idVariante);
    return sum + (item?.precio || 0) * cantidad;
  }, 0);

  const lineasCarrito = Array.from(carrito.entries()).map(([idVariante, cantidad]) => {
    const item = catalogo.find(p => p.idVariante === idVariante);
    return {
      ...item!,
      cantidad,
      subtotal: (item?.precio || 0) * cantidad,
    };
  });

  const hayStockSuficiente = () => {
    for (const [idVariante, cantidad] of carrito.entries()) {
      const disponible = getDisponible(idVariante);
      if (cantidad > disponible) return false;
    }
    return true;
  };

  const handleCobrar = () => {
    if (!cliente) {
      setShowClienteModal(true);
      return;
    }
    setIdempotencyKey(generateIdempotencyKey());
    setShowMedioPagoModal(true);
  };

  const procesarCheckout = async () => {
    if (!cliente) return;
    
    setCheckoutLoading(true);
    setCheckoutError(null);
    
    const lineas = lineasCarrito.map(l => ({
      idVariante: l.idVariante,
      cantidad: l.cantidad,
    }));
    
    const despacho = {
      tipo: 'retiro' as const,
      comuna: 'Santiago',
      direccion: 'Av. Principal 123, Rockstar Store',
      referencia: 'Retiro en tienda',
    };
    
    try {
      const response = await crearCheckout(cliente.accessToken, {
        claveIdempotencia: idempotencyKey,
        lineas,
        despacho,
      });
      setCheckoutResponse(response);
      await procesarRetorno(response.tokenPago);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error en checkout';
      if (mensaje.toLowerCase().includes('stock') || mensaje.toLowerCase().includes('insuficiente')) {
        setCheckoutError('Sin stock: ' + mensaje);
        setShowCheckoutError(true);
        await cargarCatalogo();
      } else {
        setCheckoutError(mensaje);
        setShowCheckoutError(true);
      }
    } finally {
      setCheckoutLoading(false);
    }
  };

  const procesarRetorno = async (tokenPago: string) => {
    if (!cliente) return;
    
    try {
      const aprobar = medioPago === 'contado';
      const response = await retornoPago(cliente.accessToken, { tokenPago, aprobar });
      
      if (response.estado === 'aprobado' || response.estado === 'pagado') {
        await mostrarBoleta(response);
        setCarrito(new Map());
        await cargarCatalogo();
        await cargarRegistro();
      } else if (response.estado === 'rechazado') {
        setCheckoutError(`Pago rechazado: ${response.motivo || 'Tarjeta declinada'}`);
        setShowCheckoutError(true);
      } else if (response.estado === 'pendiente') {
        setCheckoutError('Pago pendiente de confirmación');
        setShowCheckoutError(true);
      }
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error en retorno de pago';
      setCheckoutError(mensaje);
      setShowCheckoutError(true);
    }
  };

  const reintentarCheckout = async () => {
    if (!checkoutResponse) return;
    await procesarRetorno(checkoutResponse.tokenPago);
  };

  const mostrarBoleta = async (retorno: RetornoPagoResponse) => {
    const lineasBoleta = lineasCarrito.map(l => ({
      producto: l.producto,
      banda: l.banda,
      color: l.color,
      talla: l.talla,
      cantidad: l.cantidad,
      precioUnitario: l.precio,
      subtotal: l.subtotal,
    }));
    
    const boleta = {
      idVenta: retorno.idVenta,
      fecha: new Date().toLocaleString('es-CL'),
      lineas: lineasBoleta,
      subtotal: total,
      flete: 0,
      total: retorno.total,
      medioPago: medioPago === 'contado' ? 'Efectivo' : 'Tarjeta (Webpay Simulado)',
      giro: 'Rockstar Store SpA - Gira Musical y Merchandising',
      direccion: 'Av. Principal 123, Santiago, Chile',
      rut: '76.123.456-7',
    };
    
    setBoletaData(boleta);
    setShowBoleta(true);
    setShowMedioPagoModal(false);
  };

  const imprimirBoleta = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow || !boletaData) return;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Boleta #${boletaData.idVenta}</title>
        <style>
          body { font-family: monospace; padding: 20px; max-width: 300px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
          .info { font-size: 12px; margin-bottom: 10px; }
          .lineas { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 10px 0; }
          .linea { display: flex; justify-content: space-between; font-size: 12px; margin: 4px 0; }
          .totales { text-align: right; margin-top: 10px; }
          .total { font-size: 16px; font-weight: bold; }
          .giro { text-align: center; font-size: 11px; margin-top: 15px; border-top: 1px dashed #000; padding-top: 10px; }
          @media print { body { padding: 0; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>${boletaData.giro}</h2>
          <p>${boletaData.direccion} | RUT: ${boletaData.rut}</p>
        </div>
        <div class="info">
          <p><strong>BOLETA DE VENTA</strong></p>
          <p>N° ${boletaData.idVenta} | ${boletaData.fecha}</p>
          <p>Vendedor: ${vendedor?.usuario.nombre}</p>
        </div>
        <div class="lineas">
          ${boletaData.lineas.map((l: any) => `
            <div class="linea">
              <span>${l.cantidad}x ${l.producto} (${l.talla}/${l.color})</span>
              <span>${formatCLP(l.subtotal)}</span>
            </div>
          `).join('')}
        </div>
        <div class="totales">
          <div class="linea"><span>Subtotal</span><span>${formatCLP(boletaData.subtotal)}</span></div>
          <div class="linea"><span>Flete</span><span>${formatCLP(boletaData.flete)}</span></div>
          <div class="linea total"><span>TOTAL</span><span>${formatCLP(boletaData.total)}</span></div>
          <div class="linea"><span>Medio de pago</span><span>${boletaData.medioPago}</span></div>
        </div>
        <div class="giro">
          <p>${boletaData.giro}</p>
          <p>Gracias por su compra</p>
        </div>
        <button class="no-print" onclick="window.print()" style="margin-top:20px;padding:10px 20px;">Imprimir</button>
        <script>window.onload = () => window.print();</script>
      </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleLoginCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    setClienteLoading(true);
    setClienteError(null);
    try {
      const { login } = await import('../lib/api');
      const sesion = await login(clienteEmail, clientePassword);
      if (sesion.usuario.rol.toUpperCase() !== 'CLIENTE') {
        throw new Error('La cuenta debe ser de rol CLIENTE');
      }
      setCliente(sesion);
      setShowClienteModal(false);
      setShowMedioPagoModal(true);
    } catch (err) {
      setClienteError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setClienteLoading(false);
    }
  };

  const handleCerrarSesion = () => {
    logout();
  };

  const cargarRegistro = async () => {
    if (!cliente) return;
    try {
      setRegistroLoading(true);
      const { getPendientes } = await import('../lib/api');
      const pendientes = await getPendientes(cliente.accessToken);
      setRegistroVentas(pendientes);
    } catch (err) {
      console.error('Error cargando registro:', err);
    } finally {
      setRegistroLoading(false);
    }
  };

  const handleMedioPagoConfirmar = () => {
    setShowMedioPagoModal(false);
    procesarCheckout();
  };

  if (loading) {
    return (
      <>
        <IonHeader className="pos-toolbar-sticky">
          <IonToolbar color="dark">
            <IonTitle>POS - Rockstar Store</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding pos-page">
          <div className="pos-header">
            <h2>Catálogo</h2>
          </div>
          <SkeletonGrid count={8} />
        </IonContent>
      </>
    );
  }

  return (
    <>
      <IonHeader className="pos-toolbar-sticky">
        <IonToolbar color="dark">
          <IonTitle>POS - Rockstar Store</IonTitle>
          <IonButtons slot="start">
            <IonButton onClick={cargarCatalogo} fill="clear" aria-label="Actualizar catálogo" className="recargar-btn">
              <IonIcon icon={refreshOutline} />
            </IonButton>
            <IonButton onClick={() => { setShowRegistro(true); cargarRegistro(); }} fill="clear" aria-label="Registro de jornada" className="registro-btn">
              <IonIcon icon={listOutline} />
            </IonButton>
          </IonButtons>
          <IonButtons slot="end">
            <IonButton onClick={handleCerrarSesion} fill="clear" aria-label="Cerrar sesión">
              <IonIcon icon={logOutOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding pos-page">
        <div className="pos-header">
          <h2>Catálogo</h2>
          <span className="vendedor-nombre">Vendedor: {vendedor?.usuario.nombre}</span>
        </div>

        {error && (
          <ErrorAlert message={error} onRetry={cargarCatalogo} />
        )}

        <IonAlert
          isOpen={showError}
          onDidDismiss={() => setShowError(false)}
          header="Error"
          message={error || 'Error al cargar catálogo'}
          buttons={[{ text: 'Reintentar', handler: () => cargarCatalogo() }, 'OK']}
        />

        <IonAlert
          isOpen={showCheckoutError}
          onDidDismiss={() => setShowCheckoutError(false)}
          header="Error en la venta"
          message={checkoutError || 'Error al procesar la venta'}
          buttons={[
            { text: 'Reintentar', handler: () => reintentarCheckout() },
            'OK'
          ]}
        />

        <IonGrid>
          <IonRow>
            {catalogo.map((producto) => (
              <IonCol key={producto.idVariante} size="12" sizeSm="6" sizeMd="4" sizeLg="3" sizeXl="3">
                <ProductCard
                  producto={producto}
                  cantidad={getCantidad(producto.idVariante)}
                  disponible={producto.disponible}
                  onAgregar={() => agregarAlCarrito(producto.idVariante, producto.disponible)}
                  onQuitar={() => quitarDelCarrito(producto.idVariante)}
                />
              </IonCol>
            ))}
          </IonRow>
        </IonGrid>

        {!error && catalogo.length === 0 && (
          <EmptyState
            title="Catálogo vacío"
            copy="No hay productos disponibles. Intenta recargar el catálogo."
            ctaLabel="Recargar catálogo"
            onCta={cargarCatalogo}
          />
        )}

        <div className="carrito-panel">
          <div className="carrito-header">
            <h3>Detalle de compra</h3>
            <IonBadge color="primary">{carrito.size} items</IonBadge>
          </div>
          {lineasCarrito.length === 0 ? (
            <EmptyState
              title="Carrito vacío"
              copy="Agrega productos para empezar"
              className="carrito-vacio"
              compact
              onCta={() => document.querySelector('.pos-header')?.scrollIntoView({ behavior: 'smooth' })}
            />
          ) : (
            <>
              <IonList lines="inset">
                {lineasCarrito.map((linea) => (
                  <IonItem key={linea.idVariante} lines="none">
                    <IonLabel>
                      <div className="linea-info">
                        <strong>{linea.producto}</strong>
                        <span>{linea.banda} · {linea.color} · {linea.talla}</span>
                      </div>
                      <div className="linea-cantidades">
                        <span>{linea.cantidad} × {formatCLP(linea.precio)}</span>
                        <strong>{formatCLP(linea.subtotal)}</strong>
                      </div>
                    </IonLabel>
                  </IonItem>
                ))}
              </IonList>
              <div className="carrito-total">
                <span>Total</span>
                <strong>{formatCLP(total)}</strong>
              </div>
            </>
          )}
          <IonButton
            expand="block"
            color="primary"
            size="large"
            onClick={handleCobrar}
            disabled={carrito.size === 0 || !hayStockSuficiente() || checkoutLoading}
            className="cobrar-button"
          >
            {checkoutLoading ? <IonSpinner name="crescent" slot="start" /> : <IonIcon icon={cartOutline} slot="start" />}
            {checkoutLoading ? 'Procesando...' : `Cobrar ${formatCLP(total)}`}
          </IonButton>
          {!hayStockSuficiente() && carrito.size > 0 && (
            <IonText color="danger">
              <p className="stock-warning">
                <IonIcon icon={warningOutline} /> Algunos productos superan el stock disponible
              </p>
            </IonText>
          )}
        </div>

        {/* Modal identificar cliente */}
        <IonModal
          isOpen={showClienteModal}
          onDidDismiss={() => setShowClienteModal(false)}
          className="pos-modal-centered"
          backdropDismiss={true}
          showBackdrop={true}
          aria-label="Identificar cliente"
        >
          <IonHeader>
            <IonToolbar color="dark">
              <IonTitle>Identificar cliente</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setShowClienteModal(false)} fill="clear">
                  <IonIcon icon={closeCircleOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding">
            <form onSubmit={handleLoginCliente}>
              <IonItem>
                <IonLabel position="floating">Correo cliente</IonLabel>
                <IonInput
                  id="cliente-email"
                  aria-label="Correo cliente"
                  type="email"
                  value={clienteEmail}
                  onIonChange={(e: any) => setClienteEmail(e.detail.value || '')}
                  disabled={clienteLoading}
                />
              </IonItem>
              <IonItem>
                <IonLabel position="floating">Contraseña</IonLabel>
                <IonInput
                  id="cliente-password"
                  aria-label="Contraseña cliente"
                  type="password"
                  value={clientePassword}
                  onIonChange={(e: any) => setClientePassword(e.detail.value || '')}
                  disabled={clienteLoading}
                />
              </IonItem>
              {clienteError && <IonText color="danger"><p>{clienteError}</p></IonText>}
              <IonButton expand="block" type="submit" disabled={clienteLoading}>
                {clienteLoading ? <IonSpinner name="crescent" /> : 'Continuar'}
              </IonButton>
            </form>
          </IonContent>
        </IonModal>

        {/* Modal medio de pago */}
        <IonModal
          isOpen={showMedioPagoModal}
          onDidDismiss={() => setShowMedioPagoModal(false)}
          className="pos-modal-centered"
          backdropDismiss={true}
          showBackdrop={true}
          aria-label="Medio de pago"
        >
          <IonHeader>
            <IonToolbar color="dark">
              <IonTitle>Medio de pago</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setShowMedioPagoModal(false)} fill="clear">
                  <IonIcon icon={closeCircleOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding">
            <IonRadioGroup value={medioPago} onIonChange={(e: any) => setMedioPago(e.detail.value)}>
              <IonList>
                <IonItem>
                  <IonRadio slot="start" value="contado" />
                  <IonLabel>
                    <div className="medio-pago-option">
                      <IonIcon icon={cashOutline} slot="start" color="primary" />
                      <div>
                        <strong>Contado</strong>
                        <p className="medio-pago-desc">Aprobación inmediata</p>
                      </div>
                    </div>
                  </IonLabel>
                </IonItem>
                <IonItem>
                  <IonRadio slot="start" value="tarjeta" />
                  <IonLabel>
                    <div className="medio-pago-option">
                      <IonIcon icon={cardOutline} slot="start" color="tertiary" />
                      <div>
                        <strong>Tarjeta (Webpay Simulado)</strong>
                        <p className="medio-pago-desc">Aprobar o simular rechazo</p>
                      </div>
                    </div>
                  </IonLabel>
                </IonItem>
              </IonList>
            </IonRadioGroup>
            <IonButton expand="block" color="primary" onClick={handleMedioPagoConfirmar} disabled={checkoutLoading} className="mt-16">
              {checkoutLoading ? <IonSpinner name="crescent" /> : 'Confirmar y pagar'}
            </IonButton>
          </IonContent>
        </IonModal>

        {/* Modal Boleta */}
        <IonModal
          isOpen={showBoleta}
          onDidDismiss={() => setShowBoleta(false)}
          className="boleta-modal pos-modal-centered"
          backdropDismiss={true}
          showBackdrop={true}
          aria-label="Boleta de venta"
        >
          <IonHeader>
            <IonToolbar color="dark">
              <IonTitle>Boleta de Venta</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={imprimirBoleta} fill="clear" aria-label="Imprimir boleta" className="boleta-imprimir-btn">
                  <IonIcon icon={printOutline} />
                </IonButton>
                <IonButton onClick={() => setShowBoleta(false)} fill="clear" aria-label="Cerrar boleta" className="boleta-cerrar-btn">
                  <IonIcon icon={closeCircleOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding boleta-content boleta-print">
            {boletaData && (
              <>
                <div className="boleta-header">
                  <h3>{boletaData.giro}</h3>
                  <p>{boletaData.direccion} | RUT: {boletaData.rut}</p>
                </div>
                <div className="boleta-info">
                  <div><strong>Boleta N°</strong><span>{boletaData.idVenta}</span></div>
                  <div><strong>Fecha</strong><span>{boletaData.fecha}</span></div>
                  <div><strong>Vendedor</strong><span>{vendedor?.usuario.nombre}</span></div>
                  <div><strong>Medio de pago</strong><span>{boletaData.medioPago}</span></div>
                </div>
                <div className="boleta-lineas">
                  <div className="boleta-linea">
                    <span>Producto</span>
                    <span>Cant.</span>
                    <span>P. Unit.</span>
                    <span>Subtotal</span>
                  </div>
                  {boletaData.lineas.map((l: any) => (
                    <div key={l.producto + l.talla + l.color} className="boleta-linea">
                      <span>{l.producto} ({l.talla}/{l.color})</span>
                      <span>{l.cantidad}</span>
                      <span>{formatCLP(l.precioUnitario)}</span>
                      <span>{formatCLP(l.subtotal)}</span>
                    </div>
                  ))}
                </div>
                <div className="boleta-totales">
                  <div className="linea"><span>Subtotal</span><span>{formatCLP(boletaData.subtotal)}</span></div>
                  <div className="linea"><span>Flete</span><span>{formatCLP(boletaData.flete)}</span></div>
                  <div className="linea total"><span>TOTAL</span><span>{formatCLP(boletaData.total)}</span></div>
                </div>
                <div className="boleta-giro">
                  <p>{boletaData.giro}</p>
                  <p>Gracias por su compra</p>
                </div>
              </>
            )}
          </IonContent>
        </IonModal>

        {/* Modal Registro de Jornada */}
        <IonModal
          isOpen={showRegistro}
          onDidDismiss={() => setShowRegistro(false)}
          className="registro-modal pos-modal-centered"
          backdropDismiss={true}
          showBackdrop={true}
          aria-label="Registro de jornada"
        >
          <IonHeader>
            <IonToolbar color="dark">
              <IonTitle>Registro de Jornada</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => { setShowRegistro(false); cargarRegistro(); }} fill="clear">
                  <IonIcon icon={refreshOutline} />
                </IonButton>
                <IonButton onClick={() => setShowRegistro(false)} fill="clear">
                  <IonIcon icon={closeCircleOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding registro-page">
            {registroLoading ? (
              <IonSpinner name="crescent" />
            ) : (
              <>
                <div className="registro-stats">
                  <div className="stat-card">
                    <div className="stat-value">{registroVentas.length}</div>
                    <div className="stat-label">Ventas</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">
                      {formatCLP(registroVentas.filter(v => v.estado === 'pagado').reduce((sum, v) => sum + v.total, 0))}
                    </div>
                    <div className="stat-label">Total Recaudado</div>
                  </div>
                </div>
                <IonList lines="inset">
                  {registroVentas.map((venta) => (
                    <IonItem key={venta.idVenta} className={`venta-item ${venta.estado}`}>
                      <div className="venta-header">
                        <div className="venta-info">
                          <h4>Venta #{venta.idVenta}</h4>
                          <p>{new Date(venta.fecha).toLocaleString('es-CL')}</p>
                        </div>
                        <div className="venta-total">
                          <div className="monto">{formatCLP(venta.total)}</div>
                          <div className="medio">{venta.medioPago}</div>
                        </div>
                      </div>
                      <div className="venta-detalle">
                        <span className={`estado-badge estado-${venta.estado}`}>{venta.estado.toUpperCase()}</span>
                      </div>
                    </IonItem>
                  ))}
                  {registroVentas.length === 0 && (
                    <IonItem lines="none">
                      <IonLabel>No hay ventas registradas en esta jornada</IonLabel>
                    </IonItem>
                  )}
                </IonList>
              </>
            )}
          </IonContent>
        </IonModal>
      </IonContent>
    </>
  );
};

interface ProductCardProps {
  producto: ArticuloCatalogo;
  cantidad: number;
  disponible: number;
  onAgregar: () => void;
  onQuitar: () => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ producto, cantidad, disponible, onAgregar, onQuitar }) => {
  const sinStock = disponible === 0;
  const enTope = cantidad >= disponible;

  return (
    <IonCard className={`product-card interactive-hover tap-feedback anim-fade-in ${sinStock ? 'sin-stock' : ''} ${enTope && cantidad > 0 ? 'en-tope' : ''}`}>
      <IonCardContent>
        <div className="product-image">
          <ProductImage src={getImageUrl(producto)} alt={producto.producto} />
          {sinStock && <span className="sin-stock-badge">Sin stock</span>}
          {disponible > 0 && disponible <= 5 && cantidad === 0 && (
            <span className="ultimas-unidades-badge">Últimas {disponible} unidades</span>
          )}
        </div>
        <div className="product-info">
          <h4>{producto.producto}</h4>
          <p className="product-detail">{producto.banda} · {producto.color} · {producto.talla}</p>
          <p className="product-sku">SKU: {producto.sku}</p>
        </div>
        <div className="product-price">
          <span className="price">{formatCLP(producto.precio)}</span>
          <span className="stock">Disp: {disponible}</span>
        </div>
        <div className="product-stepper">
          <IonButton
            fill="outline"
            size="small"
            onClick={onQuitar}
            disabled={cantidad === 0}
            aria-label="Quitar"
          >
            <IonIcon icon={removeOutline} />
          </IonButton>
          <span className="cantidad">{cantidad}</span>
          <IonButton
            fill="outline"
            size="small"
            onClick={onAgregar}
            disabled={sinStock || enTope}
            aria-label="Agregar"
          >
            <IonIcon icon={addOutline} />
          </IonButton>
        </div>
      </IonCardContent>
    </IonCard>
  );
};

export default POS;