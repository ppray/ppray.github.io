/**
 * image-slot.js
 * 自定义图片槽组件，支持自适应比例与兜底占位
 */
(function () {
  if (customElements.get('image-slot')) return;

  class ImageSlot extends HTMLElement {
    static get observedAttributes() {
      return ['src', 'id', 'placeholder', 'fit', 'shape'];
    }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
      this.render();
    }

    attributeChangedCallback() {
      this.render();
    }

    render() {
      const src = this.getAttribute('src') || this.getAttribute('id') || '';
      const ph = this.getAttribute('placeholder') || '';
      const fit = this.getAttribute('fit') || 'contain';
      const shape = this.getAttribute('shape') || 'rect';
      const borderRadius = shape === 'circle' ? '50%' : '4px';

      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: block;
            width: 100%;
            height: 100%;
            position: relative;
            overflow: hidden;
            border-radius: ${borderRadius};
          }
          .slot-wrap {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          img {
            width: 100%;
            height: 100%;
            object-fit: ${fit};
            display: block;
            pointer-events: none;
            transition: opacity .25s ease;
          }
          .ph {
            display: none;
            width: 100%;
            height: 100%;
            align-items: center;
            justify-content: center;
            background: rgba(182,130,53,0.1);
            color: #b68235;
            font-size: 13px;
            font-family: inherit;
            text-align: center;
            padding: 8px;
            box-sizing: border-box;
          }
          .fallback img { display: none; }
          .fallback .ph { display: flex; }
        </style>
        <div class="slot-wrap">
          <img src="${src}" alt="${ph}" onerror="this.closest('.slot-wrap').classList.add('fallback')" />
          <div class="ph">${ph}</div>
        </div>
      `;
    }
  }

  customElements.define('image-slot', ImageSlot);
})();
