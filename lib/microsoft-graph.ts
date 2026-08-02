/**
 * Microsoft Graph API client for accessing SharePoint/OneDrive files
 * Used to sync nóminas PDFs from the company SharePoint site
 */

// Environment variables matching Vercel configuration
const TENANT_ID = process.env.MICROSOFT_GRAPH_TENANT_ID!;
const CLIENT_ID = process.env.MICROSOFT_GRAPH_CLIENT_ID!;
const CLIENT_SECRET = process.env.MICROSOFT_GRAPH_CLIENT_SECRET!;
const SITE_ID = process.env.SHAREPOINT_SITE_ID!;
const DRIVE_ID = process.env.SHAREPOINT_DRIVE_ID!;

// Path to nóminas folder
const NOMINAS_BASE_PATH = '4. Recursos Humanos/3. Nóminas';

interface GraphToken {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface DriveItem {
  id: string;
  name: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  size?: number;
  lastModifiedDateTime?: string;
  '@microsoft.graph.downloadUrl'?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get an access token using client credentials flow
 */
async function getAccessToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get Graph token: ${response.status} - ${error}`);
  }

  const data: GraphToken = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

/**
 * List children of a folder by path
 */
export async function listFolderByPath(path: string): Promise<DriveItem[]> {
  const token = await getAccessToken();
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, '/');
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encodedPath}:/children`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list folder: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.value || [];
}

/**
 * Download a file by its drive item ID
 */
export async function downloadFileById(itemId: string): Promise<Buffer> {
  const token = await getAccessToken();
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${itemId}/content`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Get available months for a given year in the nóminas folder
 */
export async function getAvailableMonths(year: number): Promise<{ name: string; id: string }[]> {
  const path = `${NOMINAS_BASE_PATH}/${year}`;
  const items = await listFolderByPath(path);
  return items
    .filter(item => item.folder)
    .map(item => ({ name: item.name, id: item.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Find COSTES IO PDF files for a specific year
 * Returns files matching "COSTES IO [MES] [AÑO].pdf" plus individual nómina PDFs
 */
export async function findCostesFiles(year: number): Promise<{ name: string; id: string; month: string; monthNum: number; tipo: 'costes_io' | 'nomina_individual' }[]> {
  const months = await getAvailableMonths(year);
  const costesFiles: { name: string; id: string; month: string; monthNum: number; tipo: 'costes_io' | 'nomina_individual' }[] = [];

  const monthNames: Record<string, number> = {
    'ENERO': 1, 'FEBRERO': 2, 'MARZO': 3, 'ABRIL': 4,
    'MAYO': 5, 'JUNIO': 6, 'JULIO': 7, 'AGOSTO': 8,
    'SEPTIEMBRE': 9, 'OCTUBRE': 10, 'NOVIEMBRE': 11, 'DICIEMBRE': 12,
  };

  // Determine month number from folder name
  function getMonthNum(folderName: string): number {
    const upper = folderName.toUpperCase().trim();
    // Try direct match (folder named "ENERO", "FEBRERO", etc.)
    if (monthNames[upper]) return monthNames[upper];
    // Try "01 - Enero", "01. Enero", "01_Enero" patterns
    const numMatch = upper.match(/^(\d{1,2})/); 
    if (numMatch) return parseInt(numMatch[1]);
    // Try partial match
    for (const [name, num] of Object.entries(monthNames)) {
      if (upper.includes(name)) return num;
    }
    return 0;
  }

  for (const monthFolder of months) {
    try {
      const path = `${NOMINAS_BASE_PATH}/${year}/${monthFolder.name}`;
      const files = await listFolderByPath(path);
      const folderMonthNum = getMonthNum(monthFolder.name);
      
      // Find COSTES IO file
      const costesFile = files.find(f => 
        f.name.toUpperCase().startsWith('COSTES IO') && 
        f.name.toUpperCase().endsWith('.PDF')
      );

      if (costesFile) {
        // Extract month name from file name (e.g., "COSTES IO ENERO 2026.pdf")
        const match = costesFile.name.toUpperCase().match(/COSTES IO\s+(\w+)\s+\d{4}/);
        const monthName = match ? match[1] : '';
        const monthNum = monthNames[monthName] || folderMonthNum;

        costesFiles.push({
          name: costesFile.name,
          id: costesFile.id,
          month: monthName,
          monthNum,
          tipo: 'costes_io',
        });
      }

      // Find individual nómina PDFs (only "NÓMINA IO" files, not SOTIC)
      const individualFiles = files.filter(f => 
        f.name.toUpperCase().endsWith('.PDF') &&
        f.name.toUpperCase().startsWith('N') && // NÓMINA...
        f.name.toUpperCase().includes(' IO ') && // Only IO, not SOTIC
        !f.name.toUpperCase().startsWith('COSTES') &&
        f.file // is a file, not a folder
      );

      for (const indFile of individualFiles) {
        const monthNum = folderMonthNum;
        const monthName = Object.entries(monthNames).find(([, v]) => v === monthNum)?.[0] || '';
        costesFiles.push({
          name: indFile.name,
          id: indFile.id,
          month: monthName,
          monthNum,
          tipo: 'nomina_individual',
        });
      }
    } catch (e) {
      // Skip folders that can't be accessed
      console.warn(`Could not access folder: ${monthFolder.name}`, e);
    }
  }

  return costesFiles.sort((a, b) => a.monthNum - b.monthNum || a.tipo.localeCompare(b.tipo));
}

/**
 * Download a COSTES IO PDF file and return its buffer
 */
export async function downloadCostesFile(fileId: string): Promise<Buffer> {
  return downloadFileById(fileId);
}
