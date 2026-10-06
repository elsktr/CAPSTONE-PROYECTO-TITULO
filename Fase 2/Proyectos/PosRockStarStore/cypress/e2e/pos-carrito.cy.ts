/// <reference types="cypress" />

describe('POS Carrito - Stock y Totales Reactivos', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/salud', { estado: 'ok' }).as('salud');
    cy.intercept('GET', '/api/v1/inventario/catalogo', {
      fixture: 'catalogo.json'
    }).as('catalogo');
    cy.intercept('POST', '/api/v1/usuarios/auth/login', (req) => {
      const email = String((req.body && req.body.email) || '').toLowerCase();
      if (email === 'cliente@rockstar.cl') {
        req.reply({
          accessToken: 'client-token-123',
          refreshToken: 'client-refresh-123',
          usuario: { id: 2, nombre: 'Cliente Mostrador', email: 'cliente@rockstar.cl', rol: 'CLIENTE' }
        });
      } else {
        req.reply({
          accessToken: 'vendor-token-123',
          refreshToken: 'refresh-123',
          usuario: { id: 1, nombre: 'Vendedor Test', email: 'vendedor@rockstar.cl', rol: 'VENDEDOR' }
        });
      }
    }).as('login');
  });

  it('debe cargar el catálogo y mostrar productos en tarjetas', () => {
    cy.visit('/login');
    cy.wait('@salud');
    cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
    cy.get('#login-password input').clear().type('password123');
    cy.get('ion-button[type="submit"]').click();
    cy.wait('@login');
    cy.url().should('include', '/pos');
    cy.wait('@catalogo');
    cy.get('ion-card.product-card').should('have.length.at.least', 1);
  });

  it('debe permitir agregar y quitar cantidad con stepper y actualizar total reactivo', () => {
    cy.visit('/login');
    cy.wait('@salud');
    cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
    cy.get('#login-password input').clear().type('password123');
    cy.get('ion-button[type="submit"]').click();
    cy.wait('@login');
    cy.wait('@catalogo');

    cy.get('ion-card.product-card').first().within(() => {
      cy.get('.product-stepper ion-button').last().click();
      cy.get('.cantidad').should('contain', '1');
      cy.get('.product-stepper ion-button').last().click();
      cy.get('.cantidad').should('contain', '2');
      cy.get('.product-stepper ion-button').first().click();
      cy.get('.cantidad').should('contain', '1');
    });

    cy.get('.carrito-total strong').should('be.visible');
  });

  it('debe inhabilitar + al llegar al tope de stock', () => {
    cy.visit('/login');
    cy.wait('@salud');
    cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
    cy.get('#login-password input').clear().type('password123');
    cy.get('ion-button[type="submit"]').click();
    cy.wait('@login');
    cy.wait('@catalogo');

    cy.get('ion-card.product-card').first().within(() => {
      const maxStock = 7;
      for (let i = 0; i < maxStock; i++) {
        cy.get('.product-stepper ion-button').last().click();
      }
      cy.get('.cantidad').should('contain', '7');
      cy.get('.product-stepper ion-button').last().should('have.class', 'button-disabled');
    });
  });

  it('debe mostrar "Sin stock" y controles inhabilitados para stock 0', () => {
    cy.visit('/login');
    cy.wait('@salud');
    cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
    cy.get('#login-password input').clear().type('password123');
    cy.get('ion-button[type="submit"]').click();
    cy.wait('@login');
    cy.wait('@catalogo');

    cy.get('ion-card.product-card.sin-stock').should('exist');
    cy.get('ion-card.product-card.sin-stock').scrollIntoView().within(() => {
      cy.contains('Sin stock').should('be.visible');
      cy.get('.product-stepper ion-button').last().should('have.class', 'button-disabled');
      cy.get('.product-stepper ion-button').first().should('have.class', 'button-disabled');
    });
  });

  it('no debe permitir agregar producto con stock 0 al carrito', () => {
    cy.visit('/login');
    cy.wait('@salud');
    cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
    cy.get('#login-password input').clear().type('password123');
    cy.get('ion-button[type="submit"]').click();
    cy.wait('@login');
    cy.wait('@catalogo');

    cy.get('ion-card.product-card.sin-stock').first().within(() => {
      cy.get('.product-stepper ion-button').last().click({ force: true });
    });

    cy.get('.carrito-vacio').should('be.visible');
  });

  it('debe actualizar detalle y total sin recargar la página', () => {
    cy.visit('/login');
    cy.wait('@salud');
    cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
    cy.get('#login-password input').clear().type('password123');
    cy.get('ion-button[type="submit"]').click();
    cy.wait('@login');
    cy.wait('@catalogo');

    const initialTotal = '$0';
    cy.get('ion-card.product-card').first().within(() => {
      cy.get('.product-stepper ion-button').last().click();
    });
    cy.get('.carrito-total strong').should('contain', '$15.000');

    cy.get('ion-card.product-card').first().within(() => {
      cy.get('.product-stepper ion-button').last().click();
    });
    cy.get('.carrito-total strong').should('not.contain', initialTotal).and('contain', '$30.000');
  });
});