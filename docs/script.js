document.querySelectorAll("[data-copy-target]").forEach((copyButton) => {
  copyButton.addEventListener("click", async () => {
    const target = document.getElementById(copyButton.dataset.copyTarget);
    const status = document.querySelector(".copy-status");
    const originalLabel = copyButton.textContent;

    try {
      await navigator.clipboard.writeText(target?.innerText ?? "");
      if (status) status.textContent = "Instrucciones copiadas. Pégalas en tu IA.";
      copyButton.textContent = "Copiado";
      window.setTimeout(() => {
        copyButton.textContent = originalLabel;
      }, 1800);
    } catch {
      if (status) status.textContent = "Selecciona el mensaje para copiarlo.";
    }
  });
});
