import { Component, signal, ElementRef, ViewChild, AfterViewChecked, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
  IonButton,
  IonInput,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { sendOutline, callOutline, arrowForwardOutline, chatbubblesOutline, closeOutline } from 'ionicons/icons';

interface ChatMessage {
  from: 'bot' | 'user';
  text: string;
}

@Component({
  selector: 'app-support',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonIcon, IonButton, IonInput],
  template: `
    <ion-content class="rockstar-content" [fullscreen]="true">
      <div class="page-padded">
        <div class="page-title">
          <div class="section-title"><ion-icon name="chatbubbles-outline"></ion-icon> Soporte</div>
          <h1>Hola, soy Roxy 🎸</h1>
          <p class="text-muted">Tu asistente virtual de Rockstar e-commerce. ¿En qué te puedo ayudar?</p>
        </div>

        <div class="chat-card">
          <div class="chat-header">
            <div class="avatar">R</div>
            <div>
              <div class="chat-name">Roxy · Soporte Rockstar</div>
              <div class="chat-status"><span class="dot"></span> En línea</div>
            </div>
          </div>

          <div class="chat-body" #scrollContainer>
            <div *ngFor="let m of messages()" class="bubble" [class.user]="m.from === 'user'">
              <div class="bubble-text" [innerHTML]="format(m.text)"></div>
            </div>
          </div>

          <div class="quick-replies">
            <button class="chip" *ngFor="let q of quickReplies" (click)="send(q)">{{ q }}</button>
          </div>

          <div class="chat-input">
            <ion-input
              [(ngModel)]="inputText"
              (keydown.enter)="send()"
              placeholder="Escribe tu mensaje..."
              fill="outline"
              mode="dark"
            ></ion-input>
            <ion-button class="btn-rockstar send-btn" (click)="send()">
              <ion-icon slot="icon-only" name="send-outline"></ion-icon>
            </ion-button>
          </div>

          <a [href]="whatsappUrl" target="_blank" rel="noopener" class="wa-link">
            <ion-icon name="call-outline"></ion-icon>
            Continuar en WhatsApp
            <ion-icon name="arrow-forward-outline"></ion-icon>
          </a>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    .page-title { margin-bottom: 20px; }
    .page-title h1 { margin: 8px 0; font-size: 24px; font-weight: 900; }
    .chat-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
    .chat-header { display: flex; align-items: center; gap: 12px; padding: 16px; background: linear-gradient(90deg, #047857, #059669); color: #fff; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; background: rgba(255, 255, 255, 0.15); display: grid; place-items: center; font-weight: 900; font-size: 18px; }
    .chat-name { font-weight: 700; font-size: 14px; }
    .chat-status { display: flex; align-items: center; gap: 4px; font-size: 11px; opacity: 0.9; }
    .chat-status .dot { width: 6px; height: 6px; border-radius: 50%; background: #a7f3d0; }
    .chat-body { padding: 16px; min-height: 300px; max-height: 400px; overflow-y: auto; background: #0b141a; display: flex; flex-direction: column; gap: 8px; }
    .bubble { max-width: 80%; padding: 8px 12px; border-radius: 16px; font-size: 13px; line-height: 1.4; align-self: flex-start; background: #27272a; }
    .bubble.user { align-self: flex-end; background: #059669; color: #fff; }
    .bubble-text { white-space: pre-line; }
    .quick-replies { display: flex; gap: 8px; padding: 8px 16px; overflow-x: auto; border-top: 1px solid #18181b; }
    .chip {
      background: #18181b; border: 1px solid var(--border);
      border-radius: 999px; padding: 6px 12px;
      color: var(--text-muted); font-size: 11px; font-weight: 600;
      white-space: nowrap; cursor: pointer;
    }
    .chip:hover { border-color: #059669; color: #fff; }
    .chat-input { display: flex; gap: 8px; padding: 12px 16px; align-items: center; border-top: 1px solid #18181b; }
    .send-btn { margin: 0; --padding-start: 12px; --padding-end: 12px; }
    .wa-link {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 10px; border-top: 1px solid #18181b;
      color: #34d399; font-size: 12px; font-weight: 600;
      text-decoration: none;
    }
    .wa-link:hover { background: #18181b; }
  `],
})
export class SupportPage implements AfterViewChecked {
  router = inject(Router);
  @ViewChild('scrollContainer') scrollContainer?: ElementRef<HTMLDivElement>;

  whatsappUrl = `https://wa.me/56900000000?text=${encodeURIComponent('Hola Roxy, necesito ayuda con un pedido 🎸')}`;

  quickReplies = ['Rastrear mi pedido', 'Quiero hacer una devolución', 'Hablar con un agente'];
  inputText = '';

  messages = signal<ChatMessage[]>([
    { from: 'bot', text: '¡Hola! Soy *Roxy*, tu asistente de Rockstar 🚀 ¿En qué te puedo ayudar hoy?' },
    { from: 'bot', text: 'Puedo ayudarte con:\n1. 📦 Rastreo de pedidos\n2. 🔄 Cambios y devoluciones\n3. 💳 Métodos de pago\n4. 👕 Consultas de productos' },
  ]);

  private botResponses: Record<string, string> = {
    'rastrear mi pedido': 'Para rastrear tu pedido necesito tu *Número de Orden* y el *Correo* asociado. ¿Me los compartes? 📦',
    'quiero hacer una devolución': 'Tienes hasta *30 días* después de tu compra para solicitar un cambio 🙌. Cuéntame el *motivo* y el *número de orden* para ayudarte.',
    'hablar con un agente': 'Te derivo con un asesor del equipo Rockstar 🎸. Confírmame tu *nombre completo*, *número de orden* (si aplica) y el motivo de la consulta.',
  };

  constructor() {
    addIcons({
      'send-outline': sendOutline,
      'call-outline': callOutline,
      'arrow-forward-outline': arrowForwardOutline,
      'chatbubbles-outline': chatbubblesOutline,
      'close-outline': closeOutline,
    });
  }

  ngAfterViewChecked() {
    if (this.scrollContainer) {
      const el = this.scrollContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  send(text?: string) {
    const value = (text ?? this.inputText).trim();
    if (!value) return;
    this.messages.update((m) => [...m, { from: 'user', text: value }]);
    this.inputText = '';
    const lower = value.toLowerCase();
    const response =
      Object.entries(this.botResponses).find(([k]) => lower.includes(k))?.[1] ??
      'Anotado ✅. Si me das más detalle (orden, email o producto) te ayudo al tiro.';
    setTimeout(() => {
      this.messages.update((m) => [...m, { from: 'bot', text: response }]);
    }, 600);
  }

  format(text: string): string {
    return text.replace(/\*([^*]+)\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  }
}
