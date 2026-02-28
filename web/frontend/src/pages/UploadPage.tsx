import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, CheckCircle2, AlertCircle, Loader2, Copy, X as XIcon, FileText } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import { getSupportedFormats, uploadStatement } from "@/lib/api";
import type { BankInfo, BankAccountType, UploadResponse } from "@/lib/types";

export default function UploadPage() {
  const navigate = useNavigate();
  const [banks, setBanks] = useState<BankInfo[]>([]);
  const [selectedBank, setSelectedBank] = useState("");
  const [selectedAccountType, setSelectedAccountType] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState(-1);

  interface FileResult {
    filename: string;
    response: UploadResponse | null;
    error: string | null;
  }
  const [results, setResults] = useState<FileResult[]>([]);

  useEffect(() => {
    getSupportedFormats().then((data) => setBanks(data.banks)).catch(console.error);
  }, []);

  const currentBank = banks.find((b) => b.name === selectedBank);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) {
      setFiles((prev) => {
        const existingNames = new Set(prev.map((f) => f.name));
        const newOnes = accepted.filter((f) => !existingNames.has(f.name));
        return [...prev, ...newOnes];
      });
      setResults([]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  });

  const handleUpload = async () => {
    if (files.length === 0 || !selectedBank || !selectedAccountType) {
      toast.error("Please select a bank, account type, and at least one file.");
      return;
    }

    setUploading(true);
    setResults([]);
    const collected: typeof results = [];

    for (let i = 0; i < files.length; i++) {
      setUploadingIndex(i);
      try {
        const res = await uploadStatement(files[i], selectedBank, selectedAccountType);
        collected.push({ filename: files[i].name, response: res, error: null });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        collected.push({ filename: files[i].name, response: null, error: msg });
      }
      setResults([...collected]);
    }

    setUploadingIndex(-1);
    setUploading(false);

    const ok = collected.filter((r) => r.response && r.response.record_count > 0).length;
    const dup = collected.filter((r) => r.response && r.response.record_count === 0 && r.response.duplicate_count > 0).length;
    const errs = collected.filter((r) => r.error).length;

    if (ok > 0) toast.success(`${ok} file${ok === 1 ? "" : "s"} uploaded successfully!`);
    if (dup > 0) toast.warning(`${dup} file${dup === 1 ? "" : "s"} had only duplicates.`);
    if (errs > 0) toast.error(`${errs} file${errs === 1 ? "" : "s"} failed to upload.`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upload Bank Statement</h1>
        <p className="text-muted-foreground">
          Upload your bank statement file to parse and analyze your transactions.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Statement Details</CardTitle>
            <CardDescription>Select your bank and account type</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bank">Bank</Label>
              <Select value={selectedBank} onValueChange={(v) => { setSelectedBank(v); setSelectedAccountType(""); }}>
                <SelectTrigger id="bank">
                  <SelectValue placeholder="Select bank" />
                </SelectTrigger>
                <SelectContent>
                  {banks.map((b) => (
                    <SelectItem key={b.name} value={b.name}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-type">Account Type</Label>
              <Select
                value={selectedAccountType}
                onValueChange={setSelectedAccountType}
                disabled={!currentBank}
              >
                <SelectTrigger id="account-type">
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                {currentBank?.account_types.map((at: BankAccountType) => (
                    <SelectItem key={at.type} value={at.type}>
                      {at.type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {currentBank && (() => {
              const atInfo = currentBank.account_types.find((a) => a.type === selectedAccountType);
              const formats = atInfo?.formats ?? [];
              return formats.length > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Accepted formats:</span>
                  {formats.map((f) => (
                    <Badge key={f} variant="secondary">{f}</Badge>
                  ))}
                </div>
              ) : null;
            })()}
          </CardContent>
        </Card>

        {/* Right: Drop zone */}
        <Card>
          <CardHeader>
            <CardTitle>Upload File</CardTitle>
            <CardDescription>Drag and drop or click to select — multiple files supported</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer ${
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="font-medium text-sm">
                {isDragActive ? "Drop files here..." : "Drop statement files here"}
              </p>
              <p className="text-xs text-muted-foreground">or click to browse — select multiple files</p>
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {files.map((f, i) => {
                  const res = results.find((r) => r.filename === f.name);
                  const isCurrentlyUploading = uploading && uploadingIndex === i;
                  return (
                    <div key={f.name} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      {isCurrentlyUploading ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                      ) : res?.error ? (
                        <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                      ) : res?.response ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="flex-1 truncate font-medium">{f.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                      {!uploading && !res && (
                        <button
                          className="ml-1 text-muted-foreground hover:text-foreground"
                          onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <Button
              className="mt-4 w-full"
              size="lg"
              onClick={handleUpload}
              disabled={files.length === 0 || !selectedBank || !selectedAccountType || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading {uploadingIndex + 1} of {files.length}...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload {files.length > 0 ? `${files.length} File${files.length > 1 ? "s" : ""}` : "Files"}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((r, i) => (
            <Card key={i}>
              <CardContent className="pt-5">
                <div className="flex items-start gap-4">
                  {r.error ? (
                    <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-red-500" />
                  ) : r.response && r.response.record_count === 0 && r.response.duplicate_count > 0 ? (
                    <Copy className="mt-0.5 h-6 w-6 shrink-0 text-yellow-500" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-green-500" />
                  )}
                  <div className="flex-1 space-y-1">
                    {r.error ? (
                      <>
                        <p className="font-semibold text-red-600">{r.filename}: Upload failed</p>
                        <p className="text-sm text-muted-foreground">{r.error}</p>
                      </>
                    ) : r.response ? (
                      <>
                        <p className="font-semibold">{r.response.message}</p>
                        <p className="text-sm text-muted-foreground">
                          {r.response.bank_name} · {r.response.account_type} · {r.filename}
                        </p>
                        {r.response.duplicate_count > 0 && (
                          <div className="flex items-center gap-1.5 text-sm text-yellow-600 dark:text-yellow-400">
                            <Copy className="h-3.5 w-3.5" />
                            <span>
                              {r.response.duplicate_count} duplicate{r.response.duplicate_count !== 1 ? "s" : ""} skipped.
                            </span>
                          </div>
                        )}
                        {r.response.error_details && r.response.error_details.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-yellow-600 dark:text-yellow-400">
                              Show parse errors ({r.response.error_details.length})
                            </summary>
                            <ul className="mt-1 space-y-0.5">
                              {r.response.error_details.map((e, j) => (
                                <li key={j} className="text-xs font-mono text-red-600 dark:text-red-400">{e}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </>
                    ) : null}
                  </div>
                  {r.response && r.response.record_count > 0 && (
                    <Button variant="outline" size="sm" onClick={() => navigate("/transactions")}>
                      View →
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
