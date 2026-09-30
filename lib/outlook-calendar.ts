import { createHash } from 'node:crypto'

export type OutlookCalendarAttendee = {
  email: string
  name?: string | null
}

export type OutlookCalendarEventOptions = {
  accessToken: string
  mailbox: string
  operationId: string
  subject: string
  html: string
  start: Date
  end: Date
  location?: string | null
  attendees?: OutlookCalendarAttendee[]
  onlineMeeting?: boolean
}

export type OutlookCalendarEventResult = {
  success: boolean
  mailbox: string
  status: number | null
  error?: string
  uncertain?: boolean
  event?: {
    id: string
    iCalUId: string | null
    webLink: string | null
    joinUrl: string | null
  }
}

export async function createOutlookUserCalendarEvent(options: OutlookCalendarEventOptions): Promise<OutlookCalendarEventResult> {
  const mailbox = options.mailbox.trim().toLowerCase()
  let requestStarted = false

  try {
    const attendees = uniqueAttendees(options.attendees || []).map((attendee) => ({
      emailAddress: {
        address: attendee.email,
        ...(attendee.name ? { name: attendee.name } : {}),
      },
      type: 'required',
    }))

    const event: Record<string, unknown> = {
      subject: options.subject,
      body: { contentType: 'HTML', content: options.html },
      start: { dateTime: graphUtcDate(options.start), timeZone: 'UTC' },
      end: { dateTime: graphUtcDate(options.end), timeZone: 'UTC' },
      transactionId: deterministicUuid(options.operationId),
      responseRequested: attendees.length > 0,
      attendees,
    }
    if (options.location) event.location = { displayName: options.location }
    if (options.onlineMeeting) {
      event.isOnlineMeeting = true
      event.onlineMeetingProvider = 'teamsForBusiness'
    }

    requestStarted = true
    const response = await fetch('https://graph.microsoft.com/v1.0/me/calendar/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })

    if (response.status === 201) {
      const created = await response.json() as {
        id?: string
        iCalUId?: string
        webLink?: string
        onlineMeeting?: { joinUrl?: string } | null
      }
      if (!created.id) {
        return { success: false, mailbox, status: response.status, error: 'Microsoft no devolvió el identificador del evento.', uncertain: true }
      }
      return {
        success: true,
        mailbox,
        status: response.status,
        event: {
          id: created.id,
          iCalUId: created.iCalUId || null,
          webLink: created.webLink || null,
          joinUrl: created.onlineMeeting?.joinUrl || null,
        },
      }
    }

    const errorText = await response.text()
    let errorMessage = `Graph Calendar error ${response.status}`
    try {
      const errorJson = JSON.parse(errorText)
      errorMessage = errorJson.error?.message || errorMessage
    } catch {
      errorMessage = errorText || errorMessage
    }
    console.error('Error Microsoft Graph Calendar:', errorMessage)
    const uncertain = response.status === 408 || response.status === 429 || response.status >= 500
    return { success: false, mailbox, status: response.status, error: errorMessage, uncertain }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido creando el evento de Outlook'
    console.error('Error creando evento en Outlook:', message)
    return { success: false, mailbox, status: null, error: message, uncertain: requestStarted }
  }
}

function graphUtcDate(value: Date) {
  return value.toISOString().replace(/\.\d{3}Z$/, '')
}

function uniqueAttendees(attendees: OutlookCalendarAttendee[]) {
  const seen = new Set<string>()
  return attendees.flatMap((attendee) => {
    const email = attendee.email.trim().toLowerCase()
    if (!email || seen.has(email)) return []
    seen.add(email)
    return [{ email, name: attendee.name?.trim() || null }]
  })
}

function deterministicUuid(value: string) {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('')
  hex[12] = '4'
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const joined = hex.join('')
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`
}
