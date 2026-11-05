(function () {
  var t = localStorage.getItem("veta-theme");
  if (t) document.documentElement.setAttribute("data-theme", t);
})();
