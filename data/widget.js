self.port.on('count', function(num) {
  document.getElementById('badge').textContent = num;
});
