const pageOrder = ['/', '/projects', '/blog', '/about'];

export const getSlideDirection = (from, to) => {
  const fromIndex = pageOrder.indexOf(from);
  const toIndex = pageOrder.indexOf(to);
  return fromIndex < toIndex ? 'slide-left' : 'slide-right';
};
