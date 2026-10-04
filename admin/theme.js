// Runs before paint: light by default, dark only when picked with the toggle.
(function () {
  var t;
  try {
    t = localStorage.getItem("admin-theme");
  } catch (e) {}
  if (t !== "dark") t = "light";
  document.documentElement.dataset.theme = t;
})();
