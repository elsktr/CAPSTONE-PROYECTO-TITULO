/// <reference types="cypress" />

describe('POS - Catálogo y Carrito', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/salud', { estado: 'ok' }).as('salud');
    cy.intercept('GET', '/api/v1/inventario/catalogo', { fixture: 'catalogo-integracion.json' }).as('catalogo');
    cy.intercept('POST', '/api/v1/usuarios/auth/login', {
      accessToken: 'vendor-token-123',
      refreshToken: 'refresh-123',
      usuario: { id: 1, nombre: 'Vendedor Test', email: 'vendedor@rockstar.cl', rol: 'VENDEDOR' }
    }).as('login');
  });

  it('debe cargar 7 tarjetas de catálogo con imágenes', () => {
    cy.visit('/login');
    cy.wait('@salud');
    cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
    cy.get('#login-password input').clear().type('password123');
    cy.get('ion-button[type="submit"]').click();
    cy.wait('@login');
    cy.wait('@catalogo');
    
    cy.get('ion-card.product-card').should('have.length', 7);
    cy.get('ion-card.product-card').first().within(() => {
      cy.get('img').should('be.visible');
    });
  });

  it('debe actualizar detalle y total con stepper +/−', () => {
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
    });
    
    cy.get('.carrito-total strong').should('contain', '$30.000');
    
    cy.get('ion-card.product-card').first().within(() => {
      cy.get('.product-stepper ion-button').first().click();
      cy.get('.cantidad').should('contain', '1');
    });
    
    cy.get('.carrito-total strong').should('contain', '$15.000');
  });

  it('debe inhabilitar + al llegar al tope de stock (7/7)', () => {
    cy.visit('/login');
    cy.wait('@salud');
    cy.get('#login-email input').clear().type('vendedor@rockstar.cl');
    cy.get('#login-password input').clear().type('password123');
    cy.get('ion-button[type="submit"]').click();
    cy.wait('@login');
    cy.wait('@catalogo');
    
    cy.get('ion-card.product-card').first().within(() => {
      for (let i = 0; i < 7; i++) {
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
    cy.get('ion-card.product-card.sin-stock').first().scrollIntoView().within(() => {
      cy.contains('Sin stock').should('be.visible');
      cy.get('.product-stepper ion-button').last().should('have.class', 'button-disabled');
      cy.get('.product-stepper ion-button').first().should('have.class', 'button-disabled');
    });
  });

  it('no debe permitir agregar producto sin stock al carrito', () => {
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
});