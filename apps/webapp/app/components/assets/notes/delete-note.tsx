import { useTranslation } from "react-i18next";
import { useFetcher, useParams } from "react-router";
import { TrashIcon } from "~/components/icons/library";
import { Button } from "~/components/shared/button";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/shared/modal";
import { useDisabled } from "~/hooks/use-disabled";

export const DeleteNote = ({ noteId }: { noteId: string }) => {
  const { t } = useTranslation();
  const fetcher = useFetcher();
  const params = useParams();
  const disabled = useDisabled(fetcher);
  return (
    <AlertDialog>
      <div className="w-full">
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="link"
            className="w-full cursor-pointer items-center justify-start text-gray-800 hover:text-gray-800"
            data-test-id="deleteNoteButton"
            icon="trash"
            width="full"
          >
            {t("assets.deleteNote.delete")}
          </Button>
        </AlertDialogTrigger>
      </div>

      <AlertDialogContent>
        <AlertDialogHeader>
          <span className="flex size-12 items-center justify-center rounded-full bg-error-50 p-2 text-error-600">
            <TrashIcon />
          </span>
          <AlertDialogTitle>
            {t("assets.deleteNote.deleteNote")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("assets.deleteNote.areYouSureYouWant")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button type="button" variant="secondary" disabled={disabled}>
              {t("assets.deleteNote.cancel")}
            </Button>
          </AlertDialogCancel>

          <fetcher.Form
            method="delete"
            action={`/assets/${params.assetId}/note`}
          >
            <input type="hidden" name="noteId" value={noteId} />
            <Button
              className="border-error-600 bg-error-600 hover:border-error-800 hover:bg-error-800"
              type="submit"
              data-test-id="confirmDeleteNoteButton"
              disabled={disabled}
            >
              {t("assets.deleteNote.delete")}
            </Button>
          </fetcher.Form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
