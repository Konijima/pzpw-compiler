const PZPW_ASSETS_DIR = "assets";
const PMODULES_DIR = "media/lua/share";
const REIMPORT_TEMPLATE = `-- PIPEWRENCH --
if _G.Events.OnPipeWrenchBoot == nil then
  _G.triggerEvent('OnPipeWrenchBoot', false)
end
_G.Events.OnPipeWrenchBoot.Add(function(____flag____)
  if ____flag____ ~= true then return end
  -- {IMPORTS}
end)
----------------`;

enum PZPW_ERRORS {
  TRANSPILE_ERROR = "TRANSPILE ERROR",
  CONFIG_ERROR = "CONFIG ERROR",
}

export { PZPW_ASSETS_DIR, REIMPORT_TEMPLATE, PMODULES_DIR, PZPW_ERRORS };
