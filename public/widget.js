/**
 * FlyRank Widget Platform — embeddable loader.
 *
 * Usage on a customer's site:
 *   <script src="https://<platform>/widget/v1/widget.js" data-widget-id="abc123" async></script>
 *
 * This one file is served to every widget on every customer site (hence
 * the aggressive immutable caching on the route that serves it — see
 * src/routes/public.js). It never hardcodes which widget to render;
 * everything specific comes from the `data-widget-id` attribute on its
 * own <script> tag, and from the per-widget config it fetches at runtime.
 *
 * document.currentScript.src gives us the API origin for free — the same
 * script tag that loaded this file tells us where to call home, so there
 * is nothing to configure by hand and no way for it to silently point at
 * the wrong environment.
 */
(function () {
  "use strict";

  var thisScript = document.currentScript;
  if (!thisScript) return; // no sane way to proceed (e.g. loaded via eval)

  var widgetId = thisScript.getAttribute("data-widget-id");
  if (!widgetId) {
    console.error("[flyrank-widget] missing required data-widget-id attribute.");
    return;
  }

  var apiBase = new URL(thisScript.src).origin;

  var FIELD_TYPE_INPUT = {
    text: "text",
    email: "email",
    tel: "tel",
  };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    for (var key in attrs || {}) {
      if (key === "style") {
        node.style.cssText = attrs[key];
      } else if (key === "text") {
        node.textContent = attrs[key];
      } else {
        node.setAttribute(key, attrs[key]);
      }
    }
    (children || []).forEach(function (c) {
      node.appendChild(c);
    });
    return node;
  }

  function buildField(field) {
    var wrapper = el("div", { style: "margin-bottom:12px;" });
    var label = el("label", {
      text: field.label + (field.required ? " *" : ""),
      style: "display:block;font:600 13px system-ui,sans-serif;margin-bottom:4px;color:#14161A;",
    });
    var input;
    if (field.type === "textarea") {
      input = el("textarea", {
        name: field.name,
        rows: "3",
        style: fieldStyle(),
      });
    } else {
      input = el("input", {
        type: FIELD_TYPE_INPUT[field.type] || "text",
        name: field.name,
      });
      input.style.cssText = fieldStyle();
    }
    if (field.required) input.setAttribute("required", "required");
    label.setAttribute("for", "flyrank-field-" + field.name);
    input.id = "flyrank-field-" + field.name;
    wrapper.appendChild(label);
    wrapper.appendChild(input);
    return wrapper;
  }

  function fieldStyle() {
    return "width:100%;box-sizing:border-box;padding:8px 10px;font:14px system-ui,sans-serif;" +
      "border:1px solid #d0d0d5;border-radius:6px;outline:none;";
  }

  function buildHoneypot() {
    // Hidden from real visitors (off-screen, not display:none — some bots
    // skip fields that are display:none but still fill absolutely-
    // positioned off-screen ones, so this is the more effective trap) and
    // marked aria-hidden so screen readers skip it too.
    var wrapper = el("div", {
      "aria-hidden": "true",
      style: "position:absolute;left:-9999px;top:-9999px;",
      tabindex: "-1",
    });
    var input = el("input", {
      type: "text",
      name: "company_website",
      tabindex: "-1",
      autocomplete: "off",
    });
    wrapper.appendChild(input);
    return wrapper;
  }

  function render(config, mountPoint) {
    var form = el("form", { style: "font:14px system-ui,sans-serif;" });

    if (config.title) {
      form.appendChild(el("h3", {
        text: config.title,
        style: "font:700 18px 'Space Grotesk',system-ui,sans-serif;margin:0 0 6px;color:#14161A;",
      }));
    }
    if (config.description) {
      form.appendChild(el("p", {
        text: config.description,
        style: "margin:0 0 14px;color:#4a4a52;",
      }));
    }

    config.fields.forEach(function (field) {
      form.appendChild(buildField(field));
    });

    form.appendChild(buildHoneypot());

    var statusBox = el("div", { style: "margin-top:10px;font:13px system-ui,sans-serif;" });

    var submitBtn = el("button", {
      type: "submit",
      text: config.buttonText || "Submit",
      style:
        "background:#2B2E6B;color:#fff;border:none;border-radius:6px;padding:10px 18px;" +
        "font:600 14px system-ui,sans-serif;cursor:pointer;",
    });
    form.appendChild(submitBtn);
    form.appendChild(statusBox);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      statusBox.textContent = "";
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";

      var data = {};
      config.fields.forEach(function (field) {
        var input = document.getElementById("flyrank-field-" + field.name);
        if (input) data[field.name] = input.value;
      });

      var honeypotInput = form.querySelector('input[name="company_website"]');

      fetch(apiBase + "/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          widgetId: widgetId,
          data: data,
          company_website: honeypotInput ? honeypotInput.value : "",
        }),
      })
        .then(function (res) {
          if (!res.ok) {
            return res.json().then(function (body) {
              throw new Error((body && body.error) || "Submission failed.");
            });
          }
          return res.json();
        })
        .then(function () {
          form.reset();
          statusBox.style.color = "#177a5c";
          statusBox.textContent = "Thanks — you're on the list.";
          submitBtn.disabled = false;
          submitBtn.textContent = config.buttonText || "Submit";
        })
        .catch(function (err) {
          statusBox.style.color = "#b3261e";
          statusBox.textContent = err.message || "Something went wrong. Please try again.";
          submitBtn.disabled = false;
          submitBtn.textContent = config.buttonText || "Submit";
        });
    });

    mountPoint.appendChild(form);
  }

  function mount() {
    var container = el("div", {
      style:
        "max-width:420px;background:#FAFAF7;border:1px solid #e4e4e0;border-radius:10px;" +
        "padding:18px;box-sizing:border-box;",
    });
    // Insert right after this <script> tag, so placement on the page
    // matches wherever the customer dropped the embed snippet.
    thisScript.parentNode.insertBefore(container, thisScript.nextSibling);

    fetch(apiBase + "/widgets/" + encodeURIComponent(widgetId) + "/config")
      .then(function (res) {
        if (!res.ok) throw new Error("Widget not found.");
        return res.json();
      })
      .then(function (config) {
        render(config, container);
      })
      .catch(function () {
        container.textContent = "";
        container.style.display = "none";
        console.error("[flyrank-widget] failed to load widget " + widgetId + ".");
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
