class CartRemoveButton extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('click', (event) => {
      event.preventDefault();
      const cartItems = this.closest('cart-items') || this.closest('cart-drawer-items');
      cartItems.updateQuantity(this.dataset.index, 0);
    });
  }
}

customElements.define('cart-remove-button', CartRemoveButton);

class CartItems extends HTMLElement {
  constructor() {
    super();
    this.lineItemStatusElement =
      document.getElementById('shopping-cart-line-item-status') || document.getElementById('CartDrawer-LineItemStatus');

    const debouncedOnChange = debounce((event) => {
      this.onChange(event);
    }, ON_CHANGE_DEBOUNCE_TIMER);

    this.addEventListener('change', debouncedOnChange.bind(this));
  }

  cartUpdateUnsubscriber = undefined;

  connectedCallback() {
    this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
      if (event.source === 'cart-items') {
        return;
      }
      this.onCartUpdate();
    });
  }

  disconnectedCallback() {
    if (this.cartUpdateUnsubscriber) {
      this.cartUpdateUnsubscriber();
    }
  }

  resetQuantityInput(id) {
    const input = this.querySelector(`#Quantity-${id}`);
    input.value = input.getAttribute('value');
    this.isEnterPressed = false;
  }

  setValidity(event, index, message) {
    event.target.setCustomValidity(message);
    event.target.reportValidity();
    this.resetQuantityInput(index);
    event.target.select();
  }

  validateQuantity(event) {
    const inputValue = parseInt(event.target.value);
    const index = event.target.dataset.index;
    let message = '';

    if (inputValue < event.target.dataset.min) {
      message = window.quickOrderListStrings.min_error.replace('[min]', event.target.dataset.min);
    } else if (inputValue > parseInt(event.target.max)) {
      message = window.quickOrderListStrings.max_error.replace('[max]', event.target.max);
    } else if (inputValue % parseInt(event.target.step) !== 0) {
      message = window.quickOrderListStrings.step_error.replace('[step]', event.target.step);
    }

    if (message) {
      this.setValidity(event, index, message);
    } else {
      event.target.setCustomValidity('');
      event.target.reportValidity();
      this.updateQuantity(
        index,
        inputValue,
        document.activeElement.getAttribute('name'),
        event.target.dataset.quantityVariantId
      );
    }
  }

  onChange(event) {
    this.validateQuantity(event);
  }

  onCartUpdate() {
    if (this.tagName === 'CART-DRAWER-ITEMS') {
      fetch(`${routes.cart_url}?section_id=cart-drawer`)
        .then((response) => response.text())
        .then((responseText) => {
          const html = new DOMParser().parseFromString(responseText, 'text/html');
          const selectors = ['cart-drawer-items', '.cart-drawer__footer'];
          for (const selector of selectors) {
            const targetElement = document.querySelector(selector);
            const sourceElement = html.querySelector(selector);
            if (targetElement && sourceElement) {
              targetElement.replaceWith(sourceElement);
            }
          }
          function getCartDataAndUpdateButtons() {
            $.ajax({
              url: '/cart.js',
              method: 'GET',
              dataType: 'json',
              success: function (data) {
                const { items: itemsInCart, total_price } = data;
                const totalPrice = total_price / 100;
                const gridVisibility = {
                  gridTwo: document.querySelector('.grid_two_products'),
                  gridFour: document.querySelector('.grid_four_products')
                };
                if (gridVisibility.gridTwo && gridVisibility.gridFour) {
                  gridVisibility.gridTwo.style.display = (totalPrice >= 499 && totalPrice <= 2000) ? 'block' : 'none';
                  gridVisibility.gridFour.style.display = (totalPrice > 2000 && totalPrice <= 5000) ? 'block' : 'none';
                }
                function updateButtonState(productListItems, priceRange) {
                  productListItems.forEach((listItem) => {
                    const addToCartButton = listItem.querySelector('form .quick-add__submit');
                    const productId = listItem.querySelector('form input[name="product-id"]')?.value;

                    if (productId && addToCartButton) {
                      const cartItem = itemsInCart.find((item) => item.product_id == productId);
                      addToCartButton.disabled = (priceRange && cartItem) || !priceRange;
                    }
                  });
                }
                updateButtonState(
                  document.querySelectorAll('.grid_two_products ul li'),
                  totalPrice >= 499 && totalPrice <= 2000
                );
                updateButtonState(
                  document.querySelectorAll('.grid_four_products ul li'),
                  totalPrice > 2000 && totalPrice <= 5000
                );
              },
              error: function (xhr, status, error) {
                console.error('Error fetching cart data:', error);
              }
            });
          }

          getCartDataAndUpdateButtons();

        })
        .catch((e) => {
          console.error(e);
        });
    } else {
      fetch(`${routes.cart_url}?section_id=main-cart-items`)
        .then((response) => response.text())
        .then((responseText) => {
          const html = new DOMParser().parseFromString(responseText, 'text/html');
          const sourceQty = html.querySelector('cart-items');
          this.innerHTML = sourceQty.innerHTML;
          console.log('else update')
        })
        .catch((e) => {
          console.error(e);
        });
    }
  }

  getSectionsToRender() {
    return [
      {
        id: 'main-cart-items',
        section: document.getElementById('main-cart-items').dataset.id,
        selector: '.js-contents',
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
      },
      {
        id: 'cart-live-region-text',
        section: 'cart-live-region-text',
        selector: '.shopify-section',
      },
      {
        id: 'main-cart-footer',
        section: document.getElementById('main-cart-footer').dataset.id,
        selector: '.js-contents',
      },
    ];
  }

  updateQuantity(line, quantity, name, variantId) {
    this.enableLoading(line);

    const body = JSON.stringify({
      line,
      quantity,
      sections: this.getSectionsToRender().map((section) => section.section),
      sections_url: window.location.pathname,
    });

    fetch(`${routes.cart_change_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => {
        return response.text();
      })
      .then((state) => {
        const parsedState = JSON.parse(state);
        const quantityElement =
          document.getElementById(`Quantity-${line}`) || document.getElementById(`Drawer-quantity-${line}`);
        const items = document.querySelectorAll('.cart-item');

        if (parsedState.errors) {
          quantityElement.value = quantityElement.getAttribute('value');
          this.updateLiveRegions(line, parsedState.errors);
          return;
        }

        this.classList.toggle('is-empty', parsedState.item_count === 0);
        const cartDrawerWrapper = document.querySelector('cart-drawer');
        const cartFooter = document.getElementById('main-cart-footer');

        if (cartFooter) cartFooter.classList.toggle('is-empty', parsedState.item_count === 0);
        if (cartDrawerWrapper) cartDrawerWrapper.classList.toggle('is-empty', parsedState.item_count === 0);

        this.getSectionsToRender().forEach((section) => {
          const elementToReplace =
            document.getElementById(section.id).querySelector(section.selector) || document.getElementById(section.id);
          elementToReplace.innerHTML = this.getSectionInnerHTML(
            parsedState.sections[section.section],
            section.selector
          );
        });
        const updatedValue = parsedState.items[line - 1] ? parsedState.items[line - 1].quantity : undefined;
        let message = '';
        if (items.length === parsedState.items.length && updatedValue !== parseInt(quantityElement.value)) {
          if (typeof updatedValue === 'undefined') {
            message = window.cartStrings.error;
          } else {
            message = window.cartStrings.quantityError.replace('[quantity]', updatedValue);
          }
        }
        this.updateLiveRegions(line, message);

        const lineItem =
          document.getElementById(`CartItem-${line}`) || document.getElementById(`CartDrawer-Item-${line}`);
        if (lineItem && lineItem.querySelector(`[name="${name}"]`)) {
          cartDrawerWrapper
            ? trapFocus(cartDrawerWrapper, lineItem.querySelector(`[name="${name}"]`))
            : lineItem.querySelector(`[name="${name}"]`).focus();
        } else if (parsedState.item_count === 0 && cartDrawerWrapper) {
          trapFocus(cartDrawerWrapper.querySelector('.drawer__inner-empty'), cartDrawerWrapper.querySelector('a'));
        } else if (document.querySelector('.cart-item') && cartDrawerWrapper) {
          trapFocus(cartDrawerWrapper, document.querySelector('.cart-item__name'));
        }

        publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cart-items', cartData: parsedState, variantId: variantId });
      })
      .catch(() => {
        this.querySelectorAll('.loading__spinner').forEach((overlay) => overlay.classList.add('hidden'));
        const errors = document.getElementById('cart-errors') || document.getElementById('CartDrawer-CartErrors');
        errors.textContent = window.cartStrings.error;
      })
      .finally(() => {
        this.disableLoading(line);
        function getCartDataAndUpdateButtons() {
  $.ajax({
      url: '/cart.js',
      method: 'GET',
      dataType: 'json',
      success: function (data) {
        const { items: itemsInCart, total_price } = data;
        const totalPrice = total_price / 100;
        let gridItemCount = 0;
        const grid_product_ids = [8770597257437, 8770596995293, 8770596602077, 8770597355741];
        itemsInCart.forEach((item) => {
          if (grid_product_ids.includes(item.product_id)) {
            gridItemCount += item.quantity;
            }
          });

        console.log(gridItemCount, 'gridItemCount');
        // Update button states for both grids
        updateButtonState(document.querySelectorAll('.grid_two_products ul li'), 'gridTwo', gridItemCount, totalPrice);
        updateButtonState(document.querySelectorAll('.grid_four_products ul li'), 'gridFour', gridItemCount, totalPrice);
        },
    error: function (xhr, status, error) {
      console.error('Error fetching cart data:', error);
      }
    });
     }

     function updateButtonState(productListItems, gridType, gridItemCount, totalPrice) {
       productListItems.forEach((listItem) => {
        // console.log(gridItemCount, 'gridItemCount')
         const addToCartButton = listItem.querySelector('.product_grid form .quick-add__submit');
         if (addToCartButton) {
           addToCartButton.disabled = false;
         // Conditions for disabling the button
      const isGridTwoLimitReached = gridType === 'gridTwo' && gridItemCount >= 1;
      const isGridFourLimitReached = gridType === 'gridFour' && gridItemCount >= 2;

      const isWithin499To2000 = totalPrice >= 499 && totalPrice <= 2000;
      const isWithin2000To5000 = totalPrice >= 2000 && totalPrice <= 5000;

      if ((isWithin499To2000 && (isGridTwoLimitReached || isGridFourLimitReached)) ||
          (isWithin2000To5000 && (isGridTwoLimitReached || isGridFourLimitReached))) {
        addToCartButton.disabled = true;
      }
           }
         });
       }

     getCartDataAndUpdateButtons();

      });
  }

  updateLiveRegions(line, message) {
    const lineItemError =
      document.getElementById(`Line-item-error-${line}`) || document.getElementById(`CartDrawer-LineItemError-${line}`);
    if (lineItemError) lineItemError.querySelector('.cart-item__error-text').textContent = message;

    this.lineItemStatusElement.setAttribute('aria-hidden', true);

    const cartStatus =
      document.getElementById('cart-live-region-text') || document.getElementById('CartDrawer-LiveRegionText');
    cartStatus.setAttribute('aria-hidden', false);

    setTimeout(() => {
      cartStatus.setAttribute('aria-hidden', true);
    }, 1000);
  }

  getSectionInnerHTML(html, selector) {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }

  enableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.add('cart__items--disabled');

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

    [...cartItemElements, ...cartDrawerItemElements].forEach((overlay) => overlay.classList.remove('hidden'));

    document.activeElement.blur();
    this.lineItemStatusElement.setAttribute('aria-hidden', false);
  }

  disableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.remove('cart__items--disabled');

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

    cartItemElements.forEach((overlay) => overlay.classList.add('hidden'));
    cartDrawerItemElements.forEach((overlay) => overlay.classList.add('hidden'));
  }
}

customElements.define('cart-items', CartItems);

if (!customElements.get('cart-note')) {
  customElements.define(
    'cart-note',
    class CartNote extends HTMLElement {
      constructor() {
        super();

        this.addEventListener(
          'input',
          debounce((event) => {
            let note_text = event.target.value;
      // console.log('2.....',note_text)
      
      const pickup_location = event.target?.closest('.content');
      if(pickup_location){
        const dataArray = [];
        document.querySelectorAll('.card_tabs .tab').forEach(tab => {
          const contentClass = tab.getAttribute('data-tab');
          const checkbox = document.getElementById(contentClass);
          const label = document.querySelector(`.${contentClass} label`);
          if (checkbox.checked && label) {
            dataArray.push(`${tab.textContent}: ${label.textContent}`);
          }
        });
        // console.log('dataArray::',dataArray)
        const outputTextarea = document.querySelector(".cart__note textarea");
        if (outputTextarea) {
          outputTextarea.textContent = dataArray.join("\n");
        } else {
          outputTextarea.textContent = ''
          console.log('Textarea element not found.');
        }
        note_text = dataArray.join("\n");
      }
      // console.log('3.....',note_text)
            const body = JSON.stringify({ note: note_text});
            fetch(`${routes.cart_update_url}`, { ...fetchConfig(), ...{ body } });
          }, ON_CHANGE_DEBOUNCE_TIMER)
        );
      }
    }
  );
}
