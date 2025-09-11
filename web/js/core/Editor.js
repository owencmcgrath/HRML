import { DEFAULT_CONTENT, DEBOUNCE_DELAY } from "../config.js";
import { debounce, sanitizeInput } from "../utils/helpers.js";
import { AppState } from "./State.js";
import { ParserManager } from "./Parser.js";
import { events } from "../utils/events.js";
import { exporter } from "../utils/export.js";

export class Editor {
  constructor() {
    this.state = AppState.getInstance();
    this.parser = ParserManager.getInstance();

    this.editor = document.getElementById("editor");
    this.preview = document.getElementById("preview");
    this.debugOutput = document.getElementById("debug-output");

    events.on("content-changed", (content) => {
      this.state.saveContent(content);
      this.state.updateWordCount(content);
      this.updatePreview();
    });

    events.on("toolbar-hr", () => this.insertHorizontalRule());
    events.on("toolbar-link", () => this.insertLink());
    events.on("toolbar-image", () => this.insertImage());
    events.on("toolbar-code", () => this.insertCodeBlock());
    events.on("toolbar-quote", () => this.insertQuote());
    events.on("toolbar-nested-quote", () => this.insertNestedQuote());

    events.on("export-start", () => {
      document.getElementById("exportIndicator").classList.add("loading");
    });

    events.on("export-success", () => {
      document.getElementById("exportIndicator").classList.remove("loading");
      this.state.showNotification("Export completed successfully");
    });

    events.on("export-error", ({ error }) => {
      document.getElementById("exportIndicator").classList.remove("loading");
      this.state.showNotification(`Export failed: ${error.message}`, "error");
    });

    this.bindEvents();
    this.loadContent();

    events.on("export-start", () => {
      const indicator = document.getElementById("exportIndicator");
      if (indicator) indicator.classList.add("show");
    });

    events.on("export-success", () => {
      const indicator = document.getElementById("exportIndicator");
      if (indicator) indicator.classList.remove("show");
      this.state.showNotification("Export completed successfully");
    });

    events.on("export-error", ({ error }) => {
      const indicator = document.getElementById("exportIndicator");
      if (indicator) indicator.classList.remove("show");
      this.state.showNotification(`Export failed: ${error.message}`, "error");
    });
  }

  bindEvents() {
    events.bindEvents("editor", [
      {
        type: "input",
        handler: (e) => events.emit("content-changed", e.target.value),
      },
      {
        type: "blur",
        handler: () => this.state.saveContent(this.editor.value),
      },
    ]);

    events.delegate(document.body, "click", ".toolbar-button", (e, target) => {
      const action = target.dataset.action;
      switch (action) {
        case "h1":
          this.insertMarkup("jf ", "\n", true); 
          break;
        case "h2":
          this.insertMarkup("jff ", "\n", true);
          break;
        case "h3":
          this.insertMarkup("jfff ", "\n", true);
          break;
        case "bold":
          this.insertMarkup("js ", " sj");
          break;
        case "italic":
          this.insertMarkup("jd ", " dj");
          break;
        case "underline":
          this.insertMarkup("ju ", " uj");
          break;
        case "ulist":
          this.insertMarkup("ja ", "\n", true);
          break;
        case "olist":
          this.insertMarkup("jl ", "\n", true);
          break;
        case "link":
          this.insertLink();
          break;
        case "image":
          this.insertImage();
          break;
        case "code":
          this.insertCodeBlock();
          break;
        case "quote":
          this.insertQuote();
          break;
        case "nested-quote":
          this.insertNestedQuote();
          break;
        case "hr":
          this.insertHorizontalRule();
          break;
        case "export-pdf":
          this.exportToPDF();
          break;
        default:
          console.warn(`Unknown toolbar action: ${action}`);
      }
    });

    events.bindEvents("darkModeToggle", [
      {
        type: "click",
        handler: () => this.state.toggleDarkMode(),
      },
    ]);

    events.bindShortcuts([
      {
        key: "b",
        ctrl: true,
        callback: () => this.insertMarkup("js", "sj"),
      },
      {
        key: "i",
        ctrl: true,
        callback: () => this.insertMarkup("jd", "dj"),
      },
      {
        key: "u",
        ctrl: true,
        callback: () => this.insertMarkup("ju", "uj"),
      },
      {
        key: "k",
        ctrl: true,
        callback: () => this.insertLink(),
      },
      {
        key: "q",
        ctrl: true,
        callback: () => this.insertQuote(),
      },
      {
        key: "s",
        ctrl: true,
        callback: (e) => {
          e.preventDefault();
          this.state.saveContent(this.editor.value);
        },
      },
      {
        key: "e",
        ctrl: true,
        callback: (e) => {
          e.preventDefault();
          this.exportToPDF();
        },
      },
    ]);

    const exportButton = document.getElementById("exportPDF");
    if (exportButton) {
      exportButton.removeEventListener("click", this.exportToPDF.bind(this));
      exportButton.addEventListener("click", this.exportToPDF.bind(this));
    }

    window.addEventListener("beforeunload", () => {
      this.state.saveContent(this.editor.value);
    });
  }

  loadContent() {
    this.editor.value = this.state.loadContent();
    this.updatePreview();
  }

  updatePreview() {
    try {
      const input = sanitizeInput(this.editor.value);
      const html = this.parser.parseToHtml(input);
      this.preview.innerHTML = html;
      hljs.highlightAll();
      this.logDebug("Preview updated", {
        input,
        html,
      });
    } catch (error) {
      console.error("Parser error:", error);
      this.preview.innerHTML = `<pre class="error">Error: ${error.message}</pre>`;
      this.logDebug("Parser error", {
        error: error.message,
      });
    }
  }

  insertMarkup(prefix, suffix = "", ensureNewline = true) {
    const start = this.editor.selectionStart;
    const end = this.editor.selectionEnd;
    const text = this.editor.value;
    const selectedText = text.slice(start, end);

    const isBlockLevel = prefix.match(/^(jf+|ja|jl|kl)/);
    const prependNewline =
      ensureNewline && start > 0 && text[start - 1] !== "\n" && isBlockLevel
        ? "\n"
        : "";

    const appendNewline =
      ensureNewline && !suffix.endsWith("\n") && isBlockLevel ? "\n" : "";

    const newText =
      text.slice(0, start) +
      prependNewline +
      prefix +
      (selectedText || "") + 
      suffix +
      appendNewline +
      text.slice(end);

    this.editor.value = newText;
    this.state.saveContent(newText);
    this.updatePreview();

    const newPosition =
      start +
      prependNewline.length +
      prefix.length +
      (selectedText || "").length +
      (suffix ? suffix.length : 0);
    this.editor.setSelectionRange(newPosition, newPosition);
    this.editor.focus();
  }

  insertHorizontalRule() {
    this.insertMarkup("js", "\n", true);
  }
  insertLink() {
    this.insertMarkup(`jg [text] gh [url] hg`, "\n");
  }
  insertImage() {
    this.insertMarkup(`jh [alt] gh [url] hj`, "\n", true);
  }
  insertCodeBlock() {
    this.insertMarkup(`jkd python\n`, "\ndkj", true);
  }
  insertQuote() {
    this.insertMarkup("kl ", "\n", true);
  }
  insertNestedQuote() {
    this.insertMarkup("kll ", "\n", true);
  }

  async exportToPDF() {
    const indicator = document.getElementById("exportIndicator");
    try {
      if (indicator) indicator.style.display = "flex";
      await exporter.toPDF(this.preview);
      this.state.showNotification("Export completed successfully");
    } catch (error) {
      console.error("Export failed:", error);
      this.state.showNotification("Failed to export PDF", "error");
    } finally {
      if (indicator) indicator.style.display = "none";
    }
  }

  logDebug(message, details = null) {
    if (!this.state.isDebugMode()) return;

    console.log(message);
    if (this.debugOutput) {
      let logEntry = message;
      if (details) {
        logEntry += "\n" + JSON.stringify(details, null, 2);
      }
      this.debugOutput.textContent += logEntry + "\n\n";
    }
  }
}
