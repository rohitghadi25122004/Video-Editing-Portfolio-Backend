// Runs before paint: same theme choice as the portfolio (saved, else system).
(function () {
  var t;
  try {
    t = localStorage.getItem("admin-theme");
  } catch (e) {}
  if (t !== "light" && t !== "dark") t = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = t;
})();
