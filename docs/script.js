const copyButton = document.querySelector("[data-copy-target]");

if (copyButton) {
  copyButton.addEventListener("click", async () => {
    const target = document.getElementById(copyButton.dataset.copyTarget);
    const status = document.querySelector(".copy-status");
    try {
      await navigator.clipboard.writeText(target?.innerText ?? "");
      status.textContent = "Código copiado al portapapeles.";
      copyButton.textContent = "Copiado";
    } catch {
      status.textContent = "Selecciona el código para copiarlo.";
    }
  });
}
