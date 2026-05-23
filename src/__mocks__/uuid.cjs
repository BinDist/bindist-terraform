let counter = 0;
const pad = (n, w) => String(n).padStart(w, '0');
module.exports = {
  v4: () => {
    counter += 1;
    return `00000000-0000-4000-8000-${pad(counter, 12)}`;
  },
};
