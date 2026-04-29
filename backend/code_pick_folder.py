"""Standalone script: open a native folder picker and print the chosen path.

Invoked as a subprocess so the GUI call happens in an isolated process.
Exits with code 0 and prints the path (UTF-8, no newline) when the user picks
a folder.  Prints nothing and exits 0 when the user cancels.
"""
import sys

if sys.platform == "win32":
    # Use IFileOpenDialog via COM/ctypes directly — no PowerShell, opens instantly.
    import ctypes

    def _pick_folder_com():
        ole32 = ctypes.WinDLL("ole32")

        COINIT_APARTMENTTHREADED = 0x2
        FOS_PICKFOLDERS = 0x20
        CLSCTX_INPROC_SERVER = 1
        # SIGDN_FILESYSPATH = (int)0x80058000 — passed as 4 bytes, signedness irrelevant at ABI
        SIGDN_FILESYSPATH = 0x80058000

        def parse_clsid(s):
            buf = ctypes.create_string_buffer(16)
            ole32.CLSIDFromString(s, buf)
            return buf

        # CLSID_FileOpenDialog / IID_IFileOpenDialog
        clsid_fod = parse_clsid("{DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7}")
        iid_ifod  = parse_clsid("{D57C7288-D4AD-4768-BE02-9D969532D960}")

        hr = ole32.CoInitializeEx(None, COINIT_APARTMENTTHREADED)
        coinit_ok = hr in (0, 1)  # S_OK or S_FALSE (already initialized on thread)

        pDialog = ctypes.c_void_p()
        hr = ole32.CoCreateInstance(clsid_fod, None, CLSCTX_INPROC_SERVER, iid_ifod, ctypes.byref(pDialog))
        if hr != 0:
            if coinit_ok:
                ole32.CoUninitialize()
            return None

        def vtbl_fn(ptr, idx):
            """Return the idx-th raw function pointer from a COM object's vtable."""
            vt = ctypes.cast(ctypes.cast(ptr, ctypes.POINTER(ctypes.c_void_p))[0],
                             ctypes.POINTER(ctypes.c_void_p))
            return vt[idx]

        # GetOptions [10], SetOptions [9] — add FOS_PICKFOLDERS
        opts = ctypes.c_uint32()
        ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint32))(
            vtbl_fn(pDialog, 10))(pDialog, ctypes.byref(opts))
        ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, ctypes.c_uint32)(
            vtbl_fn(pDialog, 9))(pDialog, opts.value | FOS_PICKFOLDERS)

        # Show [3]
        hr_show = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, ctypes.c_void_p)(
            vtbl_fn(pDialog, 3))(pDialog, None)

        path = None
        if hr_show == 0:  # S_OK — user selected something
            # GetResult [20] -> IShellItem
            pResult = ctypes.c_void_p()
            hr_res = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p))(
                vtbl_fn(pDialog, 20))(pDialog, ctypes.byref(pResult))

            if hr_res == 0 and pResult.value:
                # IShellItem::GetDisplayName [5] with SIGDN_FILESYSPATH
                pszPath = ctypes.c_void_p()
                hr_dn = ctypes.WINFUNCTYPE(
                    ctypes.c_long, ctypes.c_void_p, ctypes.c_uint32, ctypes.POINTER(ctypes.c_void_p)
                )(vtbl_fn(pResult, 5))(pResult, SIGDN_FILESYSPATH, ctypes.byref(pszPath))

                if hr_dn == 0 and pszPath.value:
                    path = ctypes.wstring_at(pszPath.value)
                    ole32.CoTaskMemFree(pszPath)

                # Release IShellItem [2]
                ctypes.WINFUNCTYPE(ctypes.c_ulong, ctypes.c_void_p)(vtbl_fn(pResult, 2))(pResult)

        # Release IFileOpenDialog [2]
        ctypes.WINFUNCTYPE(ctypes.c_ulong, ctypes.c_void_p)(vtbl_fn(pDialog, 2))(pDialog)

        if coinit_ok:
            ole32.CoUninitialize()
        return path

    try:
        path = _pick_folder_com()
        if path:
            sys.stdout.buffer.write(path.encode("utf-8"))
        sys.exit(0)
    except Exception as exc:
        sys.stderr.write(str(exc))
        sys.exit(1)
else:
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.wm_attributes("-topmost", True)
        path = filedialog.askdirectory(title="Select workspace folder")
        if path:
            sys.stdout.buffer.write(path.encode("utf-8"))
        sys.exit(0)
    except Exception as exc:
        sys.stderr.write(str(exc))
        sys.exit(1)
