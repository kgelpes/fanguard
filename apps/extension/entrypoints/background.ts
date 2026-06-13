export default defineBackground(() => {
  console.log("Fanguard background ready", { id: browser.runtime.id });
});
