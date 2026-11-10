# Staff attendance and the Android QR kiosk

A phone or tablet at the entrance scans a QR code on each staff member's own phone. The server decides everything: the kiosk only passes the scanned text along and shows the answer.

## Set up a kiosk on an Android phone

You need a public HTTPS address. **Android Chrome only allows the camera on HTTPS** (or `localhost`), so a phone cannot use a plain `http://192.168.x.x` address. For production, see [DEPLOYMENT.md](DEPLOYMENT.md).

1. **Turn the module on.** As Super Admin: Madrasas → the madrasa → enable *Staff attendance*.
2. **Add the shifts.** Staff Attendance → Shifts & staff → Add shift, then tick each person's shifts. Without a shift, attendance is still recorded, but nobody is counted late or early.
3. **Create the kiosk.** Attendance Kiosks → Add kiosk. A one-time code and a QR code appear. They work once, for 15 minutes.
4. **On the phone,** open Chrome and go to `https://your-domain/kiosk.html`. Enter the code, or tap *Scan the code instead* and point the phone at the QR on the admin screen.
5. **Allow the camera** when Chrome asks.
6. **Install it.** Chrome menu → *Add to Home screen* (or *Install app*), then open it from the new icon. It opens full screen.
7. **Prepare the phone:**
   - Keep it on a charger, and mount it so the rear camera faces the person scanning.
   - Turn off battery optimisation for Chrome (Settings → Apps → Chrome → Battery → Unrestricted).
   - Turn on *Screen pinning* (Settings → Security) so nobody can leave the app.
   - Set the screen timeout to the longest value as a backup to the app's own wake lock.
8. **Test it:** sign in as a staff member on another phone, open *My Attendance QR*, and show the code. The kiosk should show *Attendance marked successfully*, and the record should appear under Staff Attendance.

**The device menu:** tap the kiosk name five times quickly. It lets you switch cameras and reset the device.

## How staff use it

Each person signs in on their own phone and opens *My Attendance QR*. The code changes every 60 seconds and works once. Staff need a sign-in account and a staff record in that madrasa. If a phone is broken, an administrator can enter attendance by hand with a reason.

## Settings

Settings apply in this order, each overriding the one before: built-in defaults → organization default → madrasa → device.

| Setting | Default | What it does |
|---|---|---|
| Mode | Automatic | **Automatic:** the record decides (not checked in → check-in, otherwise check-out). **Manual:** staff tap Check In or Check Out first. **Time-based:** the clock decides, using the four window times. |
| Check-in and check-out windows | none | Outside them, the scan is refused. |
| Several check-ins in a day | off | Allows split shifts. |
| Ignore a repeat scan within | 60 seconds | A second scan this soon is refused as a duplicate. |
| Missed check-out after | 20 hours | An open session older than this is closed as *Missed check-out*, with no hours counted. |
| PIN at the kiosk | off | Each person sets their PIN on their QR page. |
| High-security mode | off | Dynamic codes only, and a PIN every time. |
| Dynamic codes | on | New code every 60 seconds; each code works once and expires in 75 seconds. |
| Static codes | off | A code that does not change. A photo of it keeps working until cancelled, so leave this off unless you have a reason. |

The kiosk screen's wording, result-screen times, dimming, camera and full screen are also configurable.

## Offline behaviour

There is no offline attendance. If the internet drops, the kiosk says *No internet connection. Attendance is not being recorded* and stops scanning. It never shows success unless the server confirmed the record. A scan whose answer was lost is retried with the same request ID, so it can't count twice.

## Security

| Risk | What stops it |
|---|---|
| A stolen or copied kiosk | Revoke it in admin; it stops at its next request. The device cookie is `httpOnly`, only its hash is stored, and it rotates every 24 hours and expires after 30 days without use. |
| A forged QR code | Codes are signed by the server, and verified only on the server. |
| A screenshot of a code | Each dynamic code works once and expires in 75 seconds. |
| Using a kiosk of another madrasa | The madrasa comes from the device record on the server, never from the kiosk. A person with no staff record there is refused. |
| Personal data in a QR code | The code holds a random ID, the user ID, the kind and expiry, and its signature. No name, salary or bank details. |
| An administrator's password on the kiosk | The kiosk has its own credential; no administrator signs in on it. |

**What this does not stop:** a rotating QR proves someone had the staff member's signed-in phone a moment ago, not that the person is at the gate. A colleague could carry two phones, or a staff member could send a live screen to someone at the gate. A PIN makes this harder but doesn't stop it. Biometrics would be a separate decision.

**Location:** you can limit a kiosk to allowed network addresses. GPS is not used, because a browser's reported location can be faked by the device sending it.

## Payroll

**Payroll reads these figures: see `PAYROLL.md`. Leave is not built.** Staff Attendance → Monthly gives the figures payroll will need, per person and as CSV: expected, present and absent days, late and early counts and minutes, worked hours, and missed check-outs.

Holidays and approved leave are not in the system yet, so **absent days are an upper limit**: a person on leave or on a holiday counts as absent.

## Known limits

- The kiosk screen and the new attendance and kiosk admin pages are in English only, even when the app is set to Urdu.
- It shows no staff photo or madrasa logo, because the system does not store them yet.
- Tested in headless Edge with a simulated camera. Not yet tested on a real Android phone, so check camera switching, wake lock, Add to Home screen and old-device speed on the actual device.
