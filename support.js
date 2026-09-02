/**
 * support.js
 * DCLogic 轻量运行时支持库与模板引擎
 */
(function (global) {
  if (global.DCLogic) return;

  global.React = global.React || {
    createRef: function () {
      return { current: null };
    }
  };

  class DCLogic {
    constructor(props) {
      this.props = props || {};
      this.state = {};
      this._mounted = false;
      this._rootEl = null;
      this._rawTemplate = null;
      this._eventRegistry = new Map();
      this._eventId = 0;
    }

    setState(patch, callback) {
      if (typeof patch === 'function') {
        this.state = Object.assign({}, this.state, patch(this.state));
      } else if (patch && typeof patch === 'object') {
        this.state = Object.assign({}, this.state, patch);
      }
      this._render();
      if (typeof this.componentDidUpdate === 'function') {
        this.componentDidUpdate();
      }
      if (typeof callback === 'function') {
        callback();
      }
    }

    renderVals() {
      return {};
    }

    _mount(rootEl) {
      this._rootEl = rootEl;
      this._rawTemplate = rootEl.innerHTML;
      this._mounted = true;
      this._pressing = false;
      this._pendingRender = false;

      // _render 每次都整棵重建 DOM。若重建落在 mousedown 与 mouseup 之间，click 会
      // 派发到二者的公共祖先上，按钮上的监听永不触发（计时器题型每 100ms 重绘一次，
      // 点击几乎必丢）。因此按压期间暂缓重绘，松手后再补。
      const down = () => { this._pressing = true; };
      const up = () => {
        if (!this._pressing) return;
        this._pressing = false;
        setTimeout(() => { if (!this._pressing && this._pendingRender) this._render(); }, 0);
      };
      if (typeof window.PointerEvent === 'function') {
        rootEl.addEventListener('pointerdown', down);
      } else {
        rootEl.addEventListener('mousedown', down);
      }
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      window.addEventListener('mouseup', up);

      this._render();
      if (typeof this.componentDidMount === 'function') {
        this.componentDidMount();
      }
    }

    _render() {
      if (!this._rootEl || !this._rawTemplate) return;
      if (this._pressing) { this._pendingRender = true; return; }
      this._pendingRender = false;
      const vals = this.renderVals() || {};
      this._eventRegistry.clear();

      const container = document.createElement('div');
      container.innerHTML = this._rawTemplate;

      this._processNode(container, vals);

      this._rootEl.innerHTML = '';
      while (container.firstChild) {
        this._rootEl.appendChild(container.firstChild);
      }

      this._bindEvents();
    }

    _resolveVal(expr, scope) {
      expr = expr.trim();
      const m = expr.match(/^\{\{\s*(.*?)\s*\}\}$/);
      const path = m ? m[1] : expr;
      if (path in scope) return scope[path];
      try {
        const fn = new Function(...Object.keys(scope), `return (${path});`);
        return fn(...Object.values(scope));
      } catch (e) {
        return undefined;
      }
    }

    _interpolate(str, scope) {
      if (typeof str !== 'string') return str;
      return str.replace(/\{\{\s*(.*?)\s*\}\}/g, (match, path) => {
        const val = this._resolveVal(path, scope);
        return val !== undefined && val !== null ? val : '';
      });
    }

    _processNode(node, scope) {
      if (!node) return;

      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent = this._interpolate(node.textContent, scope);
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag = node.tagName.toLowerCase();

      // 处理 <sc-if>
      if (tag === 'sc-if') {
        const valAttr = node.getAttribute('value');
        const cond = this._resolveVal(valAttr || '', scope);
        const parent = node.parentNode;
        if (cond) {
          const frag = document.createDocumentFragment();
          while (node.firstChild) {
            const child = node.firstChild;
            this._processNode(child, scope);
            frag.appendChild(child);
          }
          if (parent) parent.replaceChild(frag, node);
        } else {
          if (parent) parent.removeChild(node);
        }
        return;
      }

      // 处理 <sc-for>
      if (tag === 'sc-for') {
        const listAttr = node.getAttribute('list');
        const asAttr = node.getAttribute('as') || 'item';
        const list = this._resolveVal(listAttr || '', scope) || [];
        const parent = node.parentNode;
        const itemTemplate = node.innerHTML;

        const frag = document.createDocumentFragment();
        if (Array.isArray(list)) {
          list.forEach((item, index) => {
            const itemScope = Object.assign({}, scope, { [asAttr]: item, _index: index });
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = itemTemplate;
            Array.from(tempDiv.childNodes).forEach(child => {
              this._processNode(child, itemScope);
              frag.appendChild(child);
            });
          });
        }
        if (parent) parent.replaceChild(frag, node);
        return;
      }

      // 处理普通元素属性与事件
      const attrs = Array.from(node.attributes);
      attrs.forEach(attr => {
        const name = attr.name;
        const rawVal = attr.value;

        if (name === 'ref') {
          const refObj = this._resolveVal(rawVal, scope);
          if (refObj && typeof refObj === 'object') {
            refObj.current = node;
          }
          node.removeAttribute('ref');
          return;
        }

        if (name.startsWith('onclick') || name === 'onclick') {
          const fn = this._resolveVal(rawVal, scope);
          if (typeof fn === 'function') {
            const eid = 'ev_' + (++this._eventId);
            node.setAttribute('data-dc-ev', eid);
            this._eventRegistry.set(eid, fn);
          }
          node.removeAttribute(name);
          return;
        }

        if (name === 'disabled') {
          const bool = this._resolveVal(rawVal, scope);
          if (bool) {
            node.setAttribute('disabled', 'disabled');
          } else {
            node.removeAttribute('disabled');
          }
          return;
        }

        if (rawVal.includes('{{')) {
          node.setAttribute(name, this._interpolate(rawVal, scope));
        }
      });

      // 递归处理子节点
      const children = Array.from(node.childNodes);
      children.forEach(child => this._processNode(child, scope));
    }

    _bindEvents() {
      if (!this._rootEl) return;
      this._rootEl.querySelectorAll('[data-dc-ev]').forEach(el => {
        const eid = el.getAttribute('data-dc-ev');
        const fn = this._eventRegistry.get(eid);
        if (typeof fn === 'function') {
          el.addEventListener('click', fn);
        }
      });

      // 处理 hover & active 动态样式
      this._rootEl.querySelectorAll('[style-hover]').forEach(el => {
        const hoverCss = el.getAttribute('style-hover');
        const origCss = el.getAttribute('style') || '';
        el.addEventListener('mouseenter', () => {
          el.style.cssText = origCss + ';' + hoverCss;
        });
        el.addEventListener('mouseleave', () => {
          el.style.cssText = origCss;
        });
      });
    }
  }

  global.DCLogic = DCLogic;

  // 初始化 DOMContentLoaded 引导
  document.addEventListener('DOMContentLoaded', () => {
    const dcScriptEl = document.querySelector('script[data-dc-script]');
    const xdcEl = document.querySelector('x-dc');
    if (!dcScriptEl || !xdcEl) return;

    try {
      const scriptCode = dcScriptEl.textContent;
      const createComponent = new Function('DCLogic', 'React', `${scriptCode}\n return Component;`);
      const ComponentClass = createComponent(DCLogic, global.React);
      if (ComponentClass) {
        const instance = new ComponentClass({});
        instance._mount(xdcEl);
        global.__dcInstance = instance;
      }
    } catch (e) {
      console.error('Failed to initialize DC component:', e);
    }
  });

})(typeof window !== 'undefined' ? window : globalThis);
