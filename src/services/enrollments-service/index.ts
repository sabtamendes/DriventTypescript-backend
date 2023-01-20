import { request } from "@/utils/request";
import { notFoundError } from "@/errors";
import addressRepository, { CreateAddressParams } from "@/repositories/address-repository";
import enrollmentRepository, { CreateEnrollmentParams } from "@/repositories/enrollment-repository";
import { exclude } from "@/utils/prisma-utils";
import { Address, Enrollment } from "@prisma/client";

async function getAddressFromCEP(cep: string) {
  const result = await request.get(`https://viacep.com.br/ws/${cep}/json/`);

  if (!result.data || result.data?.erro) {
    throw notFoundError();
  }

  const {
    logradouro,
    complemento,
    bairro,
    localidade,
    uf,
  } = result.data;

  const address = {
    logradouro,
    complemento,
    bairro,
    cidade: localidade,
    uf
  };
  return address;
}

async function getOneWithAddressByUserId(userId: number): Promise<GetOneWithAddressByUserIdResult> {
  const enrollmentWithAddress = await enrollmentRepository.findWithAddressByUserId(userId);

  if (!enrollmentWithAddress) throw notFoundError();

  const [firstAddress] = enrollmentWithAddress.Address;
  const address = getFirstAddress(firstAddress);

  return {
    ...exclude(enrollmentWithAddress, "userId", "createdAt", "updatedAt", "Address"),
    ...(!!address && { address }),
  };
}

type GetOneWithAddressByUserIdResult = Omit<Enrollment, "userId" | "createdAt" | "updatedAt">;

function getFirstAddress(firstAddress: Address): GetAddressResult {
  if (!firstAddress) return null;

  return exclude(firstAddress, "createdAt", "updatedAt", "enrollmentId");
}

type GetAddressResult = Omit<Address, "createdAt" | "updatedAt" | "enrollmentId">;

async function createOrUpdateEnrollmentWithAddress(params: CreateOrUpdateEnrollmentWithAddress) {
  //TODO - Verificar se o CEP é válido
  const result = await request.get(`https://viacep.com.br/ws/${params.address.cep}/json/`);

  if (!result.data || result.data?.erro) {
    throw notFoundError();
  }

  const enrollment = exclude(params, "address");
  const address = getAddressForUpsert(params.address);
  const newEnrollment = await enrollmentRepository.upsert(params.userId, enrollment, exclude(enrollment, "userId"));
  await addressRepository.upsert(newEnrollment.id, address, address);
}

function getAddressForUpsert(address: CreateAddressParams) {
  return {
    ...address,
    ...(address?.addressDetail && { addressDetail: address.addressDetail }),
  };
}

export type CreateOrUpdateEnrollmentWithAddress = CreateEnrollmentParams & {
  address: CreateAddressParams;
};

const enrollmentsService = {
  getOneWithAddressByUserId,
  createOrUpdateEnrollmentWithAddress,
  getAddressFromCEP
};

export default enrollmentsService;
